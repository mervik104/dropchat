import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./api";
import type { DeviceIdentity } from "./identity";

const identity: DeviceIdentity = {
  deviceId: "device-a-00000001",
  secret: "s".repeat(43),
  name: "Мой Mac",
  platform: "web",
};

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("createApiClient", () => {
  it("registers the device", async () => {
    const fetchImpl = vi.fn(async () => response(201));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.register()).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: identity.deviceId,
        secret: identity.secret,
        name: identity.name,
        platform: identity.platform,
      }),
    });
  });

  it("accepts an existing device registration", async () => {
    const fetchImpl = vi.fn(async () => response(409));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.register()).resolves.toBeUndefined();
  });

  it("rejects a failed registration with a generic error", async () => {
    const fetchImpl = vi.fn(async () => response(400));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.register()).rejects.toThrow("api_request_failed");
  });

  it("loads peers with the device bearer token", async () => {
    const peers = { local: [], linked: [] };
    const fetchImpl = vi.fn(async () => response(200, peers));
    const api = createApiClient(fetchImpl, "https://api.example", identity);

    await expect(api.getPeers()).resolves.toEqual(peers);

    expect(fetchImpl).toHaveBeenCalledWith("https://api.example/api/peers", {
      headers: {
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
    });
  });

  it("rejects failed peer loading without leaking the secret", async () => {
    const fetchImpl = vi.fn(async () => response(401));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.getPeers()).rejects.toBeInstanceOf(ApiError);
    await expect(api.getPeers()).rejects.not.toThrow(identity.secret);
  });
});
