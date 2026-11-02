import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTokenFresh } from "../src/token-keeper";
import { plainResponse, stubFetch, tokenResponse } from "./helpers";

beforeEach(async () => {
  await tokenKeeper().fetch("https://token/invalidate", { method: "POST" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function tokenKeeper() {
  return env.TOKEN_KEEPER.get(env.TOKEN_KEEPER.idFromName("global"));
}

describe("isTokenFresh", () => {
  it("keeps tokens for five minutes before expiry", () => {
    expect(isTokenFresh(1_000_000, 699_999)).toBe(true);
    expect(isTokenFresh(1_000_000, 700_000)).toBe(false);
  });
});

describe("TokenKeeper", () => {
  it("caches a token and refreshes via the OAuth endpoint", async () => {
    const fetchMock = stubFetch(async () => tokenResponse());
    const keeper = tokenKeeper();

    const first = await keeper.fetch("https://token/token");
    expect(await first.json()).toMatchObject({ accessToken: "access-token" });
    await keeper.fetch("https://token/token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("coalesces concurrent refreshes", async () => {
    const fetchMock = stubFetch(async () => tokenResponse());
    const keeper = tokenKeeper();

    const responses = await Promise.all([
      keeper.fetch("https://token/token"),
      keeper.fetch("https://token/token"),
    ]);

    expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
      { accessToken: "access-token", expiresAt: expect.any(Number) },
      { accessToken: "access-token", expiresAt: expect.any(Number) },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates a cached token", async () => {
    const fetchMock = stubFetch(async () => tokenResponse());
    const keeper = tokenKeeper();

    await keeper.fetch("https://token/token");
    await keeper.fetch("https://token/invalidate", { method: "POST" });
    await keeper.fetch("https://token/token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns generic errors for token refresh failures", async () => {
    stubFetch(async () => plainResponse(400, { error: "bad" }));
    const response = await tokenKeeper().fetch("https://token/token");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "token_refresh_failed" });
  });

  it("rejects malformed token responses", async () => {
    stubFetch(async () => plainResponse(200, { expires_in: 100 }));
    const response = await tokenKeeper().fetch("https://token/token");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "token_refresh_failed" });
  });


  it("treats a missing expires_in as immediately stale", async () => {
    const fetchMock = stubFetch(async () =>
      plainResponse(200, { access_token: "access-token" }),
    );
    const keeper = tokenKeeper();

    await keeper.fetch("https://token/token");
    await keeper.fetch("https://token/token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 404 for unknown Keeper routes", async () => {
    const response = await tokenKeeper().fetch("https://token/unknown");

    expect(response.status).toBe(404);
  });
});
