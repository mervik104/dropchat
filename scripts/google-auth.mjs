export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export function buildAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_FILE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode({
  clientId,
  clientSecret,
  code,
  redirectUri,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`token_exchange_failed:${response.status}`);
  }

  const body = await response.json();
  if (typeof body.refresh_token !== "string" || body.refresh_token.length === 0) {
    throw new Error("refresh_token_missing");
  }

  return body;
}

export async function createDropChatFolder({ accessToken, fetchImpl = fetch }) {
  const response = await fetchImpl(DRIVE_FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "DropChat",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!response.ok) {
    throw new Error(`folder_creation_failed:${response.status}`);
  }

  const body = await response.json();
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new Error("folder_id_missing");
  }

  return body.id;
}

export function parseDotEnv(text) {
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length)
      : trimmed;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}
