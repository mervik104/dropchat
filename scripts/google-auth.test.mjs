import { describe, expect, it, vi } from "vitest";

import {
  DRIVE_FILES_URL,
  DRIVE_FILE_SCOPE,
  TOKEN_URL,
  buildAuthUrl,
  createDropChatFolder,
  exchangeCode,
  parseDotEnv,
} from "./google-auth.mjs";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("buildAuthUrl", () => {
  it("builds an offline consent URL with only drive.file scope", () => {
    const url = new URL(
      buildAuthUrl({
        clientId: "client-id",
        redirectUri: "http://127.0.0.1:9999/callback",
        state: "state-1",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("scope")).toBe(DRIVE_FILE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-1");
  });
});

describe("exchangeCode", () => {
  it("posts the authorization code and returns tokens", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { refresh_token: "refresh-1", access_token: "access-1" }),
    );

    await expect(
      exchangeCode({
        clientId: "id",
        clientSecret: "secret",
        code: "code",
        redirectUri: "http://127.0.0.1/cb",
        fetchImpl,
      }),
    ).resolves.toMatchObject({ refresh_token: "refresh-1" });

    expect(fetchImpl).toHaveBeenCalledWith(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: expect.stringContaining("grant_type=authorization_code"),
    });
  });

  it("rejects a failed exchange without exposing the body", async () => {
    const fetchImpl = vi.fn(async () => response(400, { error: "invalid_grant" }));

    await expect(
      exchangeCode({
        clientId: "id",
        clientSecret: "secret",
        code: "code",
        redirectUri: "http://127.0.0.1/cb",
        fetchImpl,
      }),
    ).rejects.toThrow("token_exchange_failed:400");
  });

  it("requires a refresh token", async () => {
    const fetchImpl = vi.fn(async () => response(200, { access_token: "a" }));

    await expect(
      exchangeCode({
        clientId: "id",
        clientSecret: "secret",
        code: "code",
        redirectUri: "http://127.0.0.1/cb",
        fetchImpl,
      }),
    ).rejects.toThrow("refresh_token_missing");
  });
});

describe("createDropChatFolder", () => {
  it("creates a folder and returns its id", async () => {
    const fetchImpl = vi.fn(async () => response(200, { id: "folder-1" }));

    await expect(
      createDropChatFolder({ accessToken: "access-1", fetchImpl }),
    ).resolves.toBe("folder-1");

    expect(fetchImpl).toHaveBeenCalledWith(DRIVE_FILES_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer access-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "DropChat",
        mimeType: "application/vnd.google-apps.folder",
      }),
    });
  });

  it("rejects folder failures and missing ids", async () => {
    await expect(
      createDropChatFolder({
        accessToken: "a",
        fetchImpl: vi.fn(async () => response(500, {})),
      }),
    ).rejects.toThrow("folder_creation_failed:500");

    await expect(
      createDropChatFolder({
        accessToken: "a",
        fetchImpl: vi.fn(async () => response(200, {})),
      }),
    ).rejects.toThrow("folder_id_missing");
  });
});

describe("parseDotEnv", () => {
  it("parses comments, export, quotes, and invalid lines", () => {
    const values = parseDotEnv(
      [
        "# comment",
        "",
        "GOOGLE_CLIENT_ID=id",
        "export GOOGLE_CLIENT_SECRET=\"secret\"",
        "DRIVE_FOLDER_ID='folder'",
        "INVALID",
      ].join("\n"),
    );

    expect(values).toEqual({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      DRIVE_FOLDER_ID: "folder",
    });
  });
});
