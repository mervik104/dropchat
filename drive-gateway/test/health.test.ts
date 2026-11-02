import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("drive gateway health", () => {
  it("returns health for the internal contract", async () => {
    const response = await exports.default.fetch("https://gateway.test/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      app: "DropChat",
      service: "drive-gateway",
    });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await exports.default.fetch("https://gateway.test/");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("does not expose health on non-GET methods", async () => {
    const response = await exports.default.fetch("https://gateway.test/health", {
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
