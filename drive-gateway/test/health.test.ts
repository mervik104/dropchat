import { describe, expect, it } from "vitest";

import { gatewayFetch, rawGatewayFetch } from "./helpers";

describe("drive gateway routing", () => {
  it("requires the internal key for health", async () => {
    const response = await rawGatewayFetch("/health");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 404 for unknown authenticated routes", async () => {
    const response = await gatewayFetch("/");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("does not expose health on non-GET methods", async () => {
    const response = await gatewayFetch("/health", { method: "POST" });

    expect(response.status).toBe(404);
  });
});
