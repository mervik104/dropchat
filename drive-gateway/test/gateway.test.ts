import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  gatewayFetch,
  jsonResponse,
  plainResponse,
  rawGatewayFetch,
  stubFetch,
  tokenResponse,
} from "./helpers";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://upload.example/session-1";
const DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files/drive-file-1?alt=media";
const ABOUT_URL =
  "https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage)";

beforeEach(async () => {
  const keeper = env.TOKEN_KEEPER.get(env.TOKEN_KEEPER.idFromName("global"));
  await keeper.fetch("https://token/invalidate", { method: "POST" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function putSession(
  sessionId = "session-1",
  totalSize = 100,
): Promise<void> {
  const store = env.SESSIONS.get(env.SESSIONS.idFromName("global"));
  await store.fetch(`https://sessions/sessions/${sessionId}`, {
    method: "PUT",
    body: JSON.stringify({
      sessionUri: UPLOAD_URL,
      totalSize,
      mime: "text/plain",
      createdAt: 1,
    }),
  });
}

describe("internal auth", () => {
  it("rejects missing or wrong internal keys on every route", async () => {
    for (const [path, method] of [
      ["/health", "GET"],
      ["/init", "POST"],
      ["/parts/session-1", "PUT"],
      ["/files/drive-file-1", "GET"],
      ["/files/drive-file-1", "DELETE"],
    ] as const) {
      expect((await rawGatewayFetch(path, { method })).status).toBe(401);
      expect(
        (
          await rawGatewayFetch(path, {
            method,
            headers: { "x-internal-key": "wrong" },
          })
        ).status,
      ).toBe(401);
    }
  });

  it("returns 404 for unknown routes with a valid key", async () => {
    const response = await gatewayFetch("/unknown");
    expect(response.status).toBe(404);
  });
});

describe("POST /init", () => {
  it("creates a resumable session without exposing the session URI", async () => {
    const fetchMock = stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
        return new Response(null, {
          status: 200,
          headers: { location: UPLOAD_URL },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const response = await gatewayFetch("/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size: 100, mime: "text/plain" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { sessionId: string };
    expect(body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain(UPLOAD_URL);
    expect(JSON.stringify(body)).not.toContain("access-token");

    const store = env.SESSIONS.get(env.SESSIONS.idFromName("global"));
    const stored = await store.fetch(
      `https://sessions/sessions/${body.sessionId}`,
    );
    expect(await stored.json()).toMatchObject({
      sessionUri: UPLOAD_URL,
      totalSize: 100,
      mime: "text/plain",
    });

    const uploadCall = fetchMock.mock.calls.find(([input]) =>
      String(input).startsWith("https://www.googleapis.com/upload/drive/v3/files"),
    );
    const uploaded = JSON.parse(String(uploadCall?.[1]?.body)) as {
      name: string;
      mimeType: string;
      parents: string[];
    };
    expect(uploaded.parents).toEqual(["folder-id"]);
    expect(uploaded.mimeType).toBe("text/plain");
    expect(uploaded.name).toMatch(/^[0-9a-f-]{36}$/);
    expect(uploaded.name).not.toBe(body.sessionId);
    expect(uploadCall?.[1]?.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "X-Upload-Content-Type": "text/plain",
      "X-Upload-Content-Length": "100",
    });
  });

  it("validates init requests", async () => {
    for (const body of [
      {},
      { size: 0, mime: "text/plain" },
      { size: 1.5, mime: "text/plain" },
      { size: 10 },
      { size: 10, mime: "" },
      null,
    ]) {
      const response = await gatewayFetch("/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
  });


  it("rejects malformed JSON", async () => {
    const response = await gatewayFetch("/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(response.status).toBe(400);
  });

  it("returns 502 when Drive omits the resumable session URI", async () => {
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response(null, { status: 200 });
    });

    const response = await gatewayFetch("/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size: 10, mime: "text/plain" }),
    });

    expect(response.status).toBe(502);
  });

  it("returns 502 when token acquisition fails", async () => {
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return plainResponse(400, { error: "bad" });
      throw new Error("should not call Drive");
    });

    const response = await gatewayFetch("/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size: 10, mime: "text/plain" }),
    });

    expect(response.status).toBe(502);
  });

  it("returns 503 when Drive session creation is unavailable", async () => {
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response("nope", { status: 500 });
    });

    const response = await gatewayFetch("/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size: 10, mime: "text/plain" }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "storage_unavailable" });
  });
});

describe("PUT /parts/:sessionId", () => {
  it("forwards a chunk and reports the next offset", async () => {
    await putSession();
    const fetchMock = stubFetch((input, init) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      if (url === UPLOAD_URL) {
        expect(init?.headers).toMatchObject({
          "content-range": "bytes 0-99/100",
        });
        return new Response(null, {
          status: 308,
          headers: { range: "bytes=0-99" },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "incomplete",
      nextOffset: 100,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      UPLOAD_URL,
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("reports completion and deletes the stored session", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return jsonResponse({ id: "drive-file-1" });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(await response.json()).toEqual({
      status: "done",
      driveFileId: "drive-file-1",
    });
    const store = env.SESSIONS.get(env.SESSIONS.idFromName("global"));
    expect((await store.fetch("https://sessions/sessions/session-1")).status).toBe(
      404,
    );
  });

  it("resynchronizes the offset after repeated Drive failures", async () => {
    await putSession();
    let uploadCalls = 0;
    stubFetch((input, init) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      if (url === UPLOAD_URL) {
        uploadCalls += 1;
        if (uploadCalls <= 3) return new Response("fail", { status: 500 });
        expect(init?.headers).toMatchObject({
          "content-range": "bytes */100",
        });
        return new Response(null, {
          status: 308,
          headers: { range: "bytes=0-49" },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(await response.json()).toEqual({
      status: "incomplete",
      nextOffset: 50,
    });
    expect(uploadCalls).toBe(4);
  });

  it("discovers completion during resync", async () => {
    await putSession();
    let uploadCalls = 0;
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      uploadCalls += 1;
      if (uploadCalls <= 3) return new Response("fail", { status: 500 });
      return jsonResponse({ id: "drive-file-2" });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(await response.json()).toEqual({
      status: "done",
      driveFileId: "drive-file-2",
    });
  });

  it("returns 503 when resync also fails", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response("fail", { status: 500 });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(503);
  });


  it("returns 502 when a completed upload has no file id", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return jsonResponse({});
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(502);
  });

  it("resyncs after a network failure", async () => {
    await putSession();
    let uploadCalls = 0;
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      uploadCalls += 1;
      if (uploadCalls === 1) throw new Error("network down");
      return new Response(null, {
        status: 308,
        headers: { range: "bytes=0-9" },
      });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(await response.json()).toEqual({
      status: "incomplete",
      nextOffset: 10,
    });
  });

  it("returns 503 when resync throws", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      throw new Error("network down");
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(503);
  });

  it("maps 403 rate limits to 429", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return jsonResponse(
        { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
        { status: 403, headers: { "retry-after": "9" } },
      );
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("9");
  });

  it("returns 429 with Retry-After for a rate-limited upload", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response("slow down", {
        status: 429,
        headers: { "retry-after": "17" },
      });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("classifies rate limits and expiry discovered during resync", async () => {
    await putSession();
    let uploadCalls = 0;
    stubFetch((input, init) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      uploadCalls += 1;
      if (uploadCalls <= 3) {
        return new Response("fail", { status: 500 });
      }
      expect(init?.headers).toMatchObject({
        "content-range": "bytes */100",
      });
      return new Response("slow down", {
        status: 429,
        headers: { "retry-after": "3" },
      });
    });
    const limited = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3");

    await putSession();
    uploadCalls = 0;
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      uploadCalls += 1;
      return uploadCalls <= 3
        ? new Response("fail", { status: 500 })
        : new Response("gone", { status: 404 });
    });
    const expired = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });
    expect(expired.status).toBe(410);

    await putSession();
    uploadCalls = 0;
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      uploadCalls += 1;
      return uploadCalls <= 3
        ? new Response("fail", { status: 500 })
        : new Response("bad", { status: 400 });
    });
    const fatal = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });
    expect(fatal.status).toBe(502);
  });

  it("returns 410 when the resumable session expired", async () => {
    await putSession();
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response("gone", { status: 404 });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "upload_session_expired",
    });
  });

  it("retries once after a Drive 401", async () => {
    await putSession();
    let tokenCalls = 0;
    let uploadCalls = 0;
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) {
        tokenCalls += 1;
        return tokenResponse(3600);
      }
      uploadCalls += 1;
      if (uploadCalls === 1) return new Response("unauthorized", { status: 401 });
      return new Response(null, {
        status: 308,
        headers: { range: "bytes=0-99" },
      });
    });

    const response = await gatewayFetch("/parts/session-1", {
      method: "PUT",
      headers: { "content-range": "bytes 0-99/100" },
      body: "chunk",
    });

    expect(response.status).toBe(200);
    expect(tokenCalls).toBe(2);
    expect(uploadCalls).toBe(2);
  });

  it("cancels a resumable session", async () => {
    await putSession();
    const response = await gatewayFetch("/parts/session-1", {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    const store = env.SESSIONS.get(env.SESSIONS.idFromName("global"));
    expect((await store.fetch("https://sessions/sessions/session-1")).status).toBe(
      404,
    );
  });

  it("rejects unknown sessions and invalid ranges", async () => {
    expect(
      (
        await gatewayFetch("/parts/missing", {
          method: "PUT",
          headers: { "content-range": "bytes 0-99/100" },
          body: "x",
        })
      ).status,
    ).toBe(404);

    await putSession();
    expect(
      (
        await gatewayFetch("/parts/session-1", {
          method: "PUT",
          headers: { "content-range": "invalid" },
          body: "x",
        })
      ).status,
    ).toBe(400);
  });
});

describe("GET /files/:driveFileId", () => {
  it("forwards Range and streams the response", async () => {
    const fetchMock = stubFetch((input, init) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      if (url === DRIVE_FILE_URL) {
        expect(init?.headers).toMatchObject({ Range: "bytes=0-2" });
        return new Response("abc", {
          status: 206,
          headers: {
            "content-range": "bytes 0-2/10",
            "content-length": "3",
            "accept-ranges": "bytes",
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const response = await gatewayFetch("/files/drive-file-1", {
      headers: { Range: "bytes=0-2" },
    });

    expect(response.status).toBe(206);
    expect(await response.text()).toBe("abc");
    expect(response.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(fetchMock).toHaveBeenCalledWith(
      DRIVE_FILE_URL,
      expect.objectContaining({ headers: expect.objectContaining({ Range: "bytes=0-2" }) }),
    );
  });


  it("returns 404 for unsupported file methods", async () => {
    const response = await gatewayFetch("/files/drive-file-1", {
      method: "PATCH",
    });
    expect(response.status).toBe(404);
  });

  it("handles full downloads, missing files, and Drive errors", async () => {
    let mode: "ok" | "missing" | "error" = "ok";
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      if (mode === "missing") return new Response("missing", { status: 404 });
      if (mode === "error") return new Response("error", { status: 500 });
      return new Response("full", { status: 200 });
    });

    expect((await gatewayFetch("/files/drive-file-1")).status).toBe(200);

    mode = "missing";
    expect((await gatewayFetch("/files/drive-file-1")).status).toBe(404);

    mode = "error";
    expect((await gatewayFetch("/files/drive-file-1")).status).toBe(502);
  });
});

describe("DELETE /files/:driveFileId", () => {
  it("deletes files and treats 404 as success", async () => {
    let status = 204;
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      return new Response(null, { status });
    });

    expect(
      (await gatewayFetch("/files/drive-file-1", { method: "DELETE" })).status,
    ).toBe(204);

    status = 404;
    expect(
      (await gatewayFetch("/files/drive-file-1", { method: "DELETE" })).status,
    ).toBe(204);
  });

  it("returns 502 for other delete failures", async () => {
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response("fail", { status: 500 });
    });

    const response = await gatewayFetch("/files/drive-file-1", {
      method: "DELETE",
    });
    expect(response.status).toBe(502);
  });
});

describe("GET /health", () => {
  it("returns quota usage", async () => {
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      if (url === ABOUT_URL) {
        return jsonResponse({
          storageQuota: { limit: "1000", usage: "123" },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const response = await gatewayFetch("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      quotaUsed: 123,
      quotaLimit: 1000,
    });
  });


  it("returns zero quota when Google omits storageQuota", async () => {
    stubFetch((input) => {
      const url = String(input);
      if (url === TOKEN_URL) return tokenResponse();
      return jsonResponse({});
    });

    const response = await gatewayFetch("/health");
    expect(await response.json()).toEqual({
      ok: true,
      quotaUsed: 0,
      quotaLimit: 0,
    });
  });

  it("returns 502 when quota lookup fails", async () => {
    stubFetch((input) => {
      if (String(input) === TOKEN_URL) return tokenResponse();
      return new Response("fail", { status: 500 });
    });

    expect((await gatewayFetch("/health")).status).toBe(502);
  });
});
