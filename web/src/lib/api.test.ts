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
  it("registers a new device", async () => {
    const fetchImpl = vi.fn(async () => response(201));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.register()).resolves.toBe("created");

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

  it("reports an existing device registration", async () => {
    const fetchImpl = vi.fn(async () => response(409));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.register()).resolves.toBe("exists");
  });

  it("rejects a failed registration with status details", async () => {
    const fetchImpl = vi.fn(async () => response(400));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.register()).rejects.toMatchObject({ status: 400 });
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

  it("rejects failed peer loading with status details", async () => {
    const fetchImpl = vi.fn(async () => response(401));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.getPeers()).rejects.toBeInstanceOf(ApiError);
    await expect(api.getPeers()).rejects.toMatchObject({ status: 401 });
  });

  it("updates the device profile", async () => {
    const profile = {
      id: identity.deviceId,
      name: "New Name",
      platform: "web",
      invisible: true,
      lastSeen: 1,
      createdAt: 0,
    };
    const fetchImpl = vi.fn(async () => response(200, profile));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.updateDevice({ name: "New Name", invisible: true })).resolves.toEqual(
      profile,
    );

    expect(fetchImpl).toHaveBeenCalledWith("/api/devices/me", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
      body: JSON.stringify({ name: "New Name", invisible: true }),
    });
  });

  it("rejects a failed profile update", async () => {
    const fetchImpl = vi.fn(async () => response(400));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.updateDevice({ name: "x" })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("Stage 3 messaging API", () => {
  it("creates a WebSocket ticket", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { ticket: "ticket-1", expiresAt: 30_000 }),
    );
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.createWsTicket()).resolves.toEqual({
      ticket: "ticket-1",
      expiresAt: 30_000,
    });

    expect(fetchImpl).toHaveBeenCalledWith("/api/ws-ticket", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
    });
  });

  it("loads the first and older message pages", async () => {
    const page = { messages: [], nextBefore: null };
    const fetchImpl = vi.fn(async () => response(200, page));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.getMessages("peer-1")).resolves.toEqual(page);
    await expect(api.getMessages("peer-1", "msg-2")).resolves.toEqual(page);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "/api/chats/peer-1/messages?limit=50",
      expect.objectContaining({
        headers: {
          Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
        },
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/chats/peer-1/messages?limit=50&before=msg-2",
      expect.anything(),
    );
  });

  it("sends a text message", async () => {
    const message = { id: "msg-1", text: "hello" };
    const fetchImpl = vi.fn(async () => response(201, { message }));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.sendText("peer-1", "hello")).resolves.toEqual(message);

    expect(fetchImpl).toHaveBeenCalledWith("/api/chats/peer-1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
      body: JSON.stringify({ kind: "text", text: "hello" }),
    });
  });

  it("rejects failed ticket, message, and read requests", async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.createWsTicket()).rejects.toMatchObject({ status: 500 });
    await expect(api.getMessages("peer-1")).rejects.toMatchObject({ status: 500 });
    await expect(api.sendText("peer-1", "x")).rejects.toMatchObject({ status: 500 });
  });
});
