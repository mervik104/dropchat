import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchWithRetry,
  isRateLimitResponse,
  parseRangeOffset,
} from "../src/google";
import { jsonResponse } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseRangeOffset", () => {
  it("extracts the next offset from a Drive Range header", () => {
    expect(parseRangeOffset("bytes=0-99")).toBe(100);
    expect(parseRangeOffset("bytes=10-19")).toBe(20);
    expect(parseRangeOffset(null)).toBe(0);
  });
});

describe("isRateLimitResponse", () => {
  it("detects 403 rateLimitExceeded responses", async () => {
    await expect(
      isRateLimitResponse(
        jsonResponse(
          { error: { errors: [{ reason: "rateLimitExceeded" }] } },
          { status: 403 },
        ),
      ),
    ).resolves.toBe(true);
    await expect(
      isRateLimitResponse(jsonResponse({ error: { errors: [] } }, { status: 403 })),
    ).resolves.toBe(false);
    await expect(
      isRateLimitResponse(new Response("not json", { status: 403 })),
    ).resolves.toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("returns successful responses without retrying", async () => {
    const makeRequest = vi.fn(async () => new Response("ok"));

    const response = await fetchWithRetry(makeRequest, 0);

    expect(response.status).toBe(200);
    expect(makeRequest).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500, 503])("retries status %s", async (status) => {
    const makeRequest = vi
      .fn()
      .mockResolvedValueOnce(new Response("fail", { status }))
      .mockResolvedValueOnce(new Response("ok"));

    const response = await fetchWithRetry(makeRequest, 0);

    expect(response.status).toBe(200);
    expect(makeRequest).toHaveBeenCalledTimes(2);
  });

  it("retries 403 rateLimitExceeded", async () => {
    const makeRequest = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { errors: [{ reason: "rateLimitExceeded" }] } },
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(new Response("ok"));

    const response = await fetchWithRetry(makeRequest, 0);

    expect(response.status).toBe(200);
    expect(makeRequest).toHaveBeenCalledTimes(2);
  });

  it("does not retry ordinary client errors", async () => {
    const makeRequest = vi.fn(async () => new Response("bad", { status: 400 }));

    const response = await fetchWithRetry(makeRequest, 0);

    expect(response.status).toBe(400);
    expect(makeRequest).toHaveBeenCalledTimes(1);
  });

  it("stops after three failed attempts", async () => {
    const makeRequest = vi.fn(async () => new Response("fail", { status: 500 }));

    const response = await fetchWithRetry(makeRequest, 0);

    expect(response.status).toBe(500);
    expect(makeRequest).toHaveBeenCalledTimes(3);
  });
});
