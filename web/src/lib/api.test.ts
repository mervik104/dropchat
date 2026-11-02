import { describe, expect, it, vi } from "vitest";

import { ApiError, UploadOffsetError, createApiClient } from "./api";
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
    headers: new Headers(),
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
      signal: expect.any(AbortSignal),
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

describe("Messaging API", () => {
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
      signal: expect.any(AbortSignal),
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

    await expect(api.sendText("peer-1", "hello", "client-1")).resolves.toEqual(message);

    expect(fetchImpl).toHaveBeenCalledWith("/api/chats/peer-1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
      body: JSON.stringify({
        kind: "text",
        text: "hello",
        clientId: "client-1",
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it("aborts a hung text request after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      );
      const api = createApiClient(fetchImpl as typeof fetch, "", identity);
      const request = api.sendText("peer-1", "x", "client-1");
      const assertion = expect(request).rejects.toThrow("Aborted");
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects failed ticket, message, and read requests", async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.createWsTicket()).rejects.toMatchObject({ status: 500 });
    await expect(api.getMessages("peer-1")).rejects.toMatchObject({ status: 500 });
    await expect(api.sendText("peer-1", "x", "client-2")).rejects.toMatchObject({ status: 500 });
  });
});

describe("Linking API", () => {
  it("requests and responds to peer links", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(201, { request: { id: "peer-1" } }))
      .mockResolvedValueOnce(
        response(200, { linked: true, peer: { id: "peer-1" } }),
      )
      .mockResolvedValueOnce(response(200, { linked: false }));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.requestPeer("peer-1")).resolves.toEqual({ id: "peer-1" });
    await expect(api.respondPeer("peer-1", true)).resolves.toEqual({
      linked: true,
      peer: { id: "peer-1" },
    });
    await expect(api.respondPeer("peer-1", false)).resolves.toEqual({
      linked: false,
      peer: undefined,
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/api/peers/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
      body: JSON.stringify({ toDeviceId: "peer-1" }),
    });
  });

  it("creates and redeems invite codes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response(201, { code: "123456", expiresAt: 300_000 }),
      )
      .mockResolvedValueOnce(response(200, { peer: { id: "peer-1" } }));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.createInvite()).resolves.toEqual({
      code: "123456",
      expiresAt: 300_000,
    });
    await expect(api.redeemInvite("123456")).resolves.toEqual({ id: "peer-1" });

    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/invites/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
      body: JSON.stringify({ code: "123456" }),
    });
  });

  it("rejects failed link and invite requests", async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.requestPeer("peer-1")).rejects.toMatchObject({ status: 500 });
    await expect(api.respondPeer("peer-1", true)).rejects.toMatchObject({
      status: 500,
    });
    await expect(api.createInvite()).rejects.toMatchObject({ status: 500 });
    await expect(api.redeemInvite("123456")).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("Peer moderation API", () => {
  it("unlinks a peer", async () => {
    const fetchImpl = vi.fn(async () => response(204, null));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.unlinkPeer("peer-1")).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith("/api/peers/peer-1", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
    });
  });

  it("rejects failed unlink requests", async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.unlinkPeer("peer-1")).rejects.toMatchObject({ status: 500 });
  });
});

describe("File API", () => {
  it("initializes, uploads parts, reads state, completes, links, and cancels", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(201, { fileId: "file-1", partSize: 4 }))
      .mockResolvedValueOnce(
        response(200, { status: "incomplete", uploadedBytes: 4 }),
      )
      .mockResolvedValueOnce(
        response(200, { fileId: "file-1", uploadedBytes: 4, partSize: 4, state: "uploading" }),
      )
      .mockResolvedValueOnce(response(201, { message: { id: "msg-1" } }))
      .mockResolvedValueOnce(response(200, { url: "https://dl", expiresAt: 1 }))
      .mockResolvedValueOnce(response(204));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(
      api.initFile({ name: "a.txt", size: 10, mime: "text/plain", peerId: "peer-1" }),
    ).resolves.toEqual({ fileId: "file-1", partSize: 4 });
    await expect(
      api.putFilePart("file-1", 1, new Blob(["abcd"]), "bytes 0-3/10"),
    ).resolves.toEqual({ status: "incomplete", uploadedBytes: 4 });
    await expect(api.getFileState("file-1")).resolves.toMatchObject({
      uploadedBytes: 4,
    });
    await expect(api.completeFile("file-1")).resolves.toEqual({ id: "msg-1" });
    await expect(api.createFileLink("file-1")).resolves.toEqual({
      url: "https://dl",
      expiresAt: 1,
    });
    await expect(api.cancelFile("file-1")).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "/api/files/file-1/parts/1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "content-range": "bytes 0-3/10",
          Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
        }),
      }),
    );
  });

  it("surfaces the server offset for a rejected part", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(409, { uploadedBytes: 4 }))
      .mockResolvedValueOnce(response(409, { error: "invalid_offset" }))
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        headers: new Headers(),
        json: async () => {
          throw new Error("no body");
        },
      } as unknown as Response);
    const api = createApiClient(fetchImpl, "", identity);

    await expect(
      api.putFilePart("file-1", 1, new Blob(["abcd"]), "bytes 0-3/10"),
    ).rejects.toBeInstanceOf(UploadOffsetError);
    await expect(
      api.putFilePart("file-1", 1, new Blob(["abcd"]), "bytes 0-3/10"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      api.putFilePart("file-1", 1, new Blob(["abcd"]), "bytes 0-3/10"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("exposes Retry-After for rate-limited parts", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "17" },
      }),
    );
    const api = createApiClient(fetchImpl as typeof fetch, "", identity);

    await expect(
      api.putFilePart("file-1", 1, new Blob(["x"]), "bytes 0-0/1"),
    ).rejects.toMatchObject({ status: 429, retryAfterMs: 17_000 });

    const invalid = vi.fn(async () =>
      new Response("busy", {
        status: 503,
        headers: { "retry-after": "not-a-date" },
      }),
    );
    await expect(
      createApiClient(invalid as typeof fetch, "", identity).putFilePart(
        "file-1",
        1,
        new Blob(["x"]),
        "bytes 0-0/1",
      ),
    ).rejects.toMatchObject({ status: 503, retryAfterMs: 0 });

    const dated = vi.fn(async () =>
      new Response("busy", {
        status: 503,
        headers: {
          "retry-after": new Date(Date.now() + 5_000).toUTCString(),
        },
      }),
    );
    const datedError = await createApiClient(dated as typeof fetch, "", identity)
      .putFilePart("file-1", 1, new Blob(["x"]), "bytes 0-0/1")
      .catch((error: unknown) => error);
    expect(datedError).toMatchObject({ status: 503 });
    expect((datedError as { retryAfterMs: number }).retryAfterMs).toBeGreaterThan(0);
  });

  it("forwards caller aborts to file requests", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const api = createApiClient(fetchImpl as typeof fetch, "", identity);

    const completing = api.completeFile("file-1", controller.signal);
    controller.abort();
    await expect(completing).rejects.toMatchObject({ name: "AbortError" });

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      api.getFileState("file-1", aborted.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects file API failures", async () => {
    const fetchImpl = vi.fn(async () => response(500));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(
      api.initFile({ name: "a", size: 1, mime: "x", peerId: "p" }),
    ).rejects.toMatchObject({ status: 500 });
    await expect(
      api.putFilePart("f", 1, new Blob(["x"]), "bytes 0-0/1"),
    ).rejects.toMatchObject({ status: 500 });
    await expect(api.getFileState("f")).rejects.toMatchObject({ status: 500 });
    await expect(api.completeFile("f")).rejects.toMatchObject({ status: 500 });
    await expect(api.createFileLink("f")).rejects.toMatchObject({ status: 500 });
    await expect(api.cancelFile("f")).rejects.toMatchObject({ status: 500 });
  });
});


describe("Drive health API", () => {
  it("loads Drive quota", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { ok: true, quotaUsed: 10, quotaLimit: 100 }),
    );
    const api = createApiClient(fetchImpl, "", identity);

    await expect(api.getDriveHealth()).resolves.toEqual({
      ok: true,
      quotaUsed: 10,
      quotaLimit: 100,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/health/drive", {
      headers: { Authorization: `Bearer ${identity.deviceId}.${identity.secret}` },
    });
  });

  it("rejects failed health checks", async () => {
    const api = createApiClient(vi.fn(async () => response(502)), "", identity);
    await expect(api.getDriveHealth()).rejects.toMatchObject({ status: 502 });
  });
});


describe("P2P metadata API", () => {
  it("sends P2P file metadata", async () => {
    const message = { id: "msg-1", transport: "p2p" };
    const fetchImpl = vi.fn(async () => response(201, { message }));
    const api = createApiClient(fetchImpl, "", identity);

    await expect(
      api.sendP2PFileMeta("peer-1", {
        name: "a.bin",
        size: 10,
        mime: "application/octet-stream",
      }),
    ).resolves.toEqual(message);

    expect(fetchImpl).toHaveBeenCalledWith("/api/chats/peer-1/p2p-files", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${identity.deviceId}.${identity.secret}`,
      },
      body: JSON.stringify({
        name: "a.bin",
        size: 10,
        mime: "application/octet-stream",
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects failed P2P metadata writes", async () => {
    const api = createApiClient(vi.fn(async () => response(500)), "", identity);
    await expect(
      api.sendP2PFileMeta("peer-1", { name: "a", size: 1, mime: "x" }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
