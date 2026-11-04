import { describe, expect, it, vi } from "vitest";

import type { DeviceIdentity, RandomSource } from "./identity";
import {
  IdentityRejectedError,
  RegistrationRateLimitedError,
  loadWorkspace,
} from "./workspace";

const identity: DeviceIdentity = {
  deviceId: "22222222-2222-4222-8222-222222222222",
  secret: "A".repeat(43),
  name: "Мой Mac",
  platform: "web",
};

const profile = {
  id: identity.deviceId,
  name: identity.name,
  platform: "web",
  invisible: false,
  lastSeen: 1,
  createdAt: 1,
};

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function deps(fetchImpl: typeof fetch, stored: DeviceIdentity | null = null) {
  const store = {
    load: vi.fn(async () => stored),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const random: RandomSource = {
    uuid: vi.fn(() => identity.deviceId),
    bytes: vi.fn((length) => new Uint8Array(length)),
  };

  return {
    store,
    random,
    dependencies: {
      store,
      random,
      fetchImpl,
      apiUrl: "",
      name: "Мой Mac",
      platform: "web",
    },
  };
}

describe("loadWorkspace", () => {
  it("registers a new device after an unauthorized peers request", async () => {
    const peers = { local: [], linked: [] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, profile))
      .mockResolvedValueOnce(response(200, peers));
    const { dependencies } = deps(fetchImpl);

    const workspace = await loadWorkspace(dependencies);

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

  it("saves the server-assigned unique default device name", async () => {
    const peers = { local: [], linked: [] };
    const namedProfile = { ...profile, name: "Мой Mac #4821" };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, namedProfile))
      .mockResolvedValueOnce(response(200, peers));
    const { dependencies, store } = deps(fetchImpl);

    const workspace = await loadWorkspace(dependencies);

    expect(workspace.identity.name).toBe("Мой Mac #4821");
    expect(store.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Мой Mac #4821" }),
    );
  });

  it("skips registration when the saved identity already works", async () => {
    const peers = { local: [], linked: [] };
    const fetchImpl = vi.fn(async () => response(200, peers));
    const { dependencies } = deps(fetchImpl, identity);

    const workspace = await loadWorkspace(dependencies);

    expect(workspace).toEqual({ identity, peers });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-registers a saved identity when the server lost the device", async () => {
    const peers = { local: [], linked: [] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, profile))
      .mockResolvedValueOnce(response(200, peers));
    const { dependencies, store } = deps(fetchImpl, identity);

    await expect(loadWorkspace(dependencies)).resolves.toEqual({ identity, peers });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects a saved identity instead of generating a new one on 401 + 409", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(409));
    const { dependencies, random: localRandom, store } = deps(fetchImpl, identity);

    await expect(loadWorkspace(dependencies)).rejects.toBeInstanceOf(
      IdentityRejectedError,
    );
    expect(localRandom.uuid).not.toHaveBeenCalled();
    expect(localRandom.bytes).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects when the re-registered identity still gets 401", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, profile))
      .mockResolvedValueOnce(response(401));
    const { dependencies } = deps(fetchImpl, identity);

    await expect(loadWorkspace(dependencies)).rejects.toBeInstanceOf(
      IdentityRejectedError,
    );
  });


  it("passes through a non-rate-limit registration failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(500));
    const { dependencies } = deps(fetchImpl);

    await expect(loadWorkspace(dependencies)).rejects.toMatchObject({ status: 500 });
  });

  it("passes through a non-auth failure when reloading peers after registration", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, profile))
      .mockResolvedValueOnce(response(500));
    const { dependencies } = deps(fetchImpl);

    await expect(loadWorkspace(dependencies)).rejects.toMatchObject({ status: 500 });
  });

  it("reports registration rate limiting separately", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(429));
    const { dependencies } = deps(fetchImpl);

    await expect(loadWorkspace(dependencies)).rejects.toBeInstanceOf(
      RegistrationRateLimitedError,
    );
  });

  it("passes through non-auth errors without registering", async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const { dependencies } = deps(fetchImpl, identity);

    await expect(loadWorkspace(dependencies)).rejects.toMatchObject({ status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
