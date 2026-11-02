import { describe, expect, it, vi } from "vitest";

import { createHealthClient } from "./health";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return {
    ok: init?.status === undefined || init.status < 400,
    json: async () => body,
  } as Response;
}

describe("health client", () => {
  it("returns true for a healthy server", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));

    const client = createHealthClient(fetchImpl, "");

    await expect(client.check()).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("/api/health");
  });

  it("returns false for a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }, { status: 503 }));

    const client = createHealthClient(fetchImpl, "https://api.example");

    await expect(client.check()).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/api/health");
  });

  it("returns false when the server reports not ok", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false }));

    const client = createHealthClient(fetchImpl, "");

    await expect(client.check()).resolves.toBe(false);
  });

  it("returns false when fetch rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const client = createHealthClient(fetchImpl, "");

    await expect(client.check()).resolves.toBe(false);
  });

  it("returns false when the response body is invalid", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    }) as unknown as Response);

    const client = createHealthClient(fetchImpl, "");

    await expect(client.check()).resolves.toBe(false);
  });
});
