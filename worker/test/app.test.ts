import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker hello world", () => {
  it("returns the shared protocol metadata from /api/hello", async () => {
    const response = await exports.default.fetch("https://dropchat.test/api/hello");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      app: "DropChat",
      protocol: 1,
      runtime: "worker",
    });
  });

  it("verifies the real local D1 binding from /api/health", async () => {
    const response = await exports.default.fetch("https://dropchat.test/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, app: "DropChat" });
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const response = await exports.default.fetch("https://dropchat.test/api/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("routes requests to the Hub Durable Object", async () => {
    const id = env.HUB.idFromName("device-1");
    const stub = env.HUB.get(id);

    const response = await stub.fetch("https://hub.test/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "hub" });
  });
});
