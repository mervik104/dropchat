import type { Env } from "./env";
import { fetchWithRetry, parseRangeOffset } from "./google";
import type { UploadSession } from "./session-store";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const CONTENT_RANGE_PATTERN = /^bytes \d+-\d+\/(\d+|\*)$/;

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.headers.get("x-internal-key") !== env.INTERNAL_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return await route(request, env);
  } catch {
    return googleError();
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health" && request.method === "GET") {
    return health(env);
  }

  if (url.pathname === "/init" && request.method === "POST") {
    return initUpload(request, env);
  }

  const partMatch = /^\/parts\/([^/]+)$/.exec(url.pathname);
  if (partMatch && request.method === "PUT") {
    return uploadPart(request, env, decodeURIComponent(partMatch[1]!));
  }

  const fileMatch = /^\/files\/([^/]+)$/.exec(url.pathname);
  if (fileMatch) {
    const fileId = decodeURIComponent(fileMatch[1]!);
    if (request.method === "GET") {
      return getFile(request, env, fileId);
    }
    if (request.method === "DELETE") {
      return deleteFile(env, fileId);
    }
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

async function initUpload(request: Request, env: Env): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return invalidRequest();
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidRequest();
  }

  const record = input as Record<string, unknown>;
  const size = record.size;
  const mime = record.mime;
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    typeof mime !== "string" ||
    mime.length === 0
  ) {
    return invalidRequest();
  }

  const sessionId = crypto.randomUUID();
  const driveFileId = crypto.randomUUID();

  const response = await withAccessToken(env, (token) =>
    fetchWithRetry(
      () =>
        fetch(`${UPLOAD_API}?uploadType=resumable&fields=id`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "X-Upload-Content-Type": mime,
            "X-Upload-Content-Length": String(size),
          },
          body: JSON.stringify({
            name: driveFileId,
            mimeType: mime,
            parents: [env.DRIVE_FOLDER_ID],
          }),
        }),
      retryBase(env),
    ),
  );

  if (!response.ok) {
    return googleError();
  }

  const sessionUri = response.headers.get("location");
  if (!sessionUri) {
    return googleError();
  }

  const session: UploadSession = {
    sessionUri,
    totalSize: size,
    mime,
    createdAt: Date.now(),
  };
  await storeSession(env, sessionId, session, "PUT");

  return Response.json({ sessionId }, { status: 201 });
}

async function uploadPart(
  request: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const contentRange = request.headers.get("content-range");
  if (!contentRange || !CONTENT_RANGE_PATTERN.test(contentRange)) {
    return invalidRequest();
  }

  const session = await readSession(env, sessionId);
  if (!session) {
    return notFound();
  }

  const chunk = await request.arrayBuffer();
  let response: Response;
  try {
    response = await withAccessToken(env, (token) =>
      fetchWithRetry(
        () =>
          fetch(session.sessionUri, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "content-range": contentRange,
            },
            body: chunk,
          }),
        retryBase(env),
      ),
    );
  } catch {
    return resync(env, sessionId, session);
  }

  if (response.status === 308) {
    return incomplete(response);
  }

  if (response.ok) {
    return completed(env, sessionId, response);
  }

  return resync(env, sessionId, session);
}

async function resync(
  env: Env,
  sessionId: string,
  session: UploadSession,
): Promise<Response> {
  try {
    const response = await withAccessToken(env, (token) =>
      fetchWithRetry(
        () =>
          fetch(session.sessionUri, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "content-range": `bytes */${session.totalSize}`,
            },
          }),
        retryBase(env),
      ),
    );

    if (response.status === 308) {
      return incomplete(response);
    }
    if (response.ok) {
      return completed(env, sessionId, response);
    }
    return googleError();
  } catch {
    return googleError();
  }
}

async function completed(
  env: Env,
  sessionId: string,
  response: Response,
): Promise<Response> {
  const body = (await response.json()) as { id?: string };
  if (!body.id) {
    return googleError();
  }

  await storeSession(env, sessionId, null, "DELETE");
  return Response.json({ status: "done", driveFileId: body.id });
}

function incomplete(response: Response): Response {
  return Response.json({
    status: "incomplete",
    nextOffset: parseRangeOffset(response.headers.get("range")),
  });
}

async function getFile(
  request: Request,
  env: Env,
  driveFileId: string,
): Promise<Response> {
  const range = request.headers.get("Range");
  const response = await withAccessToken(env, (token) =>
    fetchWithRetry(
      () =>
        fetch(`${DRIVE_API}/files/${encodeURIComponent(driveFileId)}?alt=media`, {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(range ? { Range: range } : {}),
          },
        }),
      retryBase(env),
    ),
  );

  if (response.status === 404) {
    return notFound();
  }
  if (!response.ok) {
    return googleError();
  }

  const headers = new Headers();
  for (const name of [
    "content-range",
    "content-length",
    "content-type",
  ] as const) {
    const value = response.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  headers.set(
    "accept-ranges",
    response.headers.get("accept-ranges") ?? "bytes",
  );

  return new Response(response.body, { status: response.status, headers });
}

async function deleteFile(env: Env, driveFileId: string): Promise<Response> {
  const response = await withAccessToken(env, (token) =>
    fetchWithRetry(
      () =>
        fetch(`${DRIVE_API}/files/${encodeURIComponent(driveFileId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
      retryBase(env),
    ),
  );

  if (response.status === 204 || response.status === 404) {
    return new Response(null, { status: 204 });
  }

  return googleError();
}

async function health(env: Env): Promise<Response> {
  const response = await withAccessToken(env, (token) =>
    fetchWithRetry(
      () =>
        fetch(`${DRIVE_API}/about?fields=storageQuota(limit,usage)`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      retryBase(env),
    ),
  );

  if (!response.ok) {
    return googleError();
  }

  const body = (await response.json()) as {
    storageQuota?: { limit?: string; usage?: string };
  };

  return Response.json({
    ok: true,
    quotaUsed: Number(body.storageQuota?.usage ?? 0),
    quotaLimit: Number(body.storageQuota?.limit ?? 0),
  });
}

async function withAccessToken(
  env: Env,
  makeRequest: (accessToken: string) => Promise<Response>,
): Promise<Response> {
  let accessToken = await getAccessToken(env);
  let response = await makeRequest(accessToken);

  if (response.status !== 401) {
    return response;
  }

  await invalidateToken(env);
  accessToken = await getAccessToken(env);
  response = await makeRequest(accessToken);
  return response;
}

async function getAccessToken(env: Env): Promise<string> {
  const stub = env.TOKEN_KEEPER.get(env.TOKEN_KEEPER.idFromName("global"));
  const response = await stub.fetch("https://token/token");
  if (!response.ok) {
    throw new Error("token_refresh_failed");
  }

  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

async function invalidateToken(env: Env): Promise<void> {
  const stub = env.TOKEN_KEEPER.get(env.TOKEN_KEEPER.idFromName("global"));
  await stub.fetch("https://token/invalidate", { method: "POST" });
}

async function storeSession(
  env: Env,
  sessionId: string,
  session: UploadSession | null,
  method: "PUT" | "DELETE",
): Promise<void> {
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName("global"));
  await stub.fetch(`https://sessions/sessions/${encodeURIComponent(sessionId)}`, {
    method,
    ...(session ? { body: JSON.stringify(session) } : {}),
  });
}

async function readSession(
  env: Env,
  sessionId: string,
): Promise<UploadSession | null> {
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName("global"));
  const response = await stub.fetch(
    `https://sessions/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (response.status === 404) {
    return null;
  }
  return (await response.json()) as UploadSession;
}

function retryBase(env: Env): number {
  return Number(env.RETRY_BASE_MS);
}

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function googleError(): Response {
  return Response.json({ error: "google_error" }, { status: 502 });
}

export { TOKEN_URL };
