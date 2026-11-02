import { describe, expect, it, vi } from "vitest";

import type { DeviceIdentity, RandomSource } from "./identity";
import { loadWorkspace } from "./workspace";

const identity: DeviceIdentity = {
  deviceId: "22222222-2222-4222-8222-222222222222",
  secret: "A".repeat(43),
  name: "Мой Mac",
  platform: "web",
};

const random: RandomSource = {
  uuid: () => identity.deviceId,
  bytes: (length) => new Uint8Array(length),
};

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("loadWorkspace", () => {
  it("registers a new device after an unauthorized peers request", async () => {
    const store = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => undefined),
    };
    const peers = { local: [], linked: [] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201))
      .mockResolvedValueOnce(response(200, peers));

    const workspace = await loadWorkspace({
      store,
      random,
      fetchImpl,
      apiUrl: "",
      name: "Мой Mac",
      platform: "web",
    });

    expect(workspace).toEqual({ identity, peers });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/peers",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${identity.deviceId}.${identity.secret}` },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/devices",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "/api/peers",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${identity.deviceId}.${identity.secret}` },
      }),
    );
  });

  it("skips registration when the saved identity already works", async () => {
    const store = {
      load: vi.fn(async () => identity),
      save: vi.fn(async () => undefined),
    };
    const peers = { local: [], linked: [] };
    const fetchImpl = vi.fn(async () => response(200, peers));

    const workspace = await loadWorkspace({
      store,
      random,
      fetchImpl,
      apiUrl: "",
      name: "Мой Mac",
      platform: "web",
    });

    expect(workspace).toEqual({ identity, peers });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/peers",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${identity.deviceId}.${identity.secret}` },
      }),
    );
  });
});
