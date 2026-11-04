import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_C,
  DEFAULT_IP,
  NOW,
  OTHER_IP,
  SECRET_A,
  SECRET_B,
  SECRET_C,
  api,
  authHeaders,
  makeApp,
  nextSocketEvent,
  openSocket,
  register,
} from "./helpers";

function post(
  app: ReturnType<typeof makeApp>,
  path: string,
  body: unknown,
  deviceId = DEVICE_A,
  secret = SECRET_A,
): Promise<Response> {
  return api(app, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(deviceId, secret),
    },
    body: JSON.stringify(body),
  });
}

async function requestPeer(
  app: ReturnType<typeof makeApp>,
  toDeviceId: string,
): Promise<Response> {
  return post(app, "/api/peers/request", { toDeviceId });
}

async function respond(
  app: ReturnType<typeof makeApp>,
  fromDeviceId: string,
  accept: boolean,
  deviceId = DEVICE_B,
  secret = SECRET_B,
): Promise<Response> {
  return post(
    app,
    "/api/peers/respond",
    { fromDeviceId, accept },
    deviceId,
    secret,
  );
}

describe("POST /api/peers/request", () => {
  it("creates a pending request for a visible local device", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });

    const response = await requestPeer(app, DEVICE_B);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { request: Record<string, unknown> };
    expect(body.request).toMatchObject({
      id: DEVICE_B,
      name: "Beta",
      platform: "web",
    });

    const row = await env.DB.prepare(
      "SELECT from_device, to_device FROM peer_requests",
    ).first<{ from_device: string; to_device: string }>();
    expect(row).toEqual({ from_device: DEVICE_A, to_device: DEVICE_B });
  });

  it("shows incoming requests on GET /api/peers", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await requestPeer(app, DEVICE_B);

    const response = await api(app, "/api/peers", {
      headers: authHeaders(DEVICE_B, SECRET_B),
    });
    const body = (await response.json()) as {
      incomingRequests: Array<{ id: string; name: string }>;
    };

    expect(body.incomingRequests).toEqual([
      expect.objectContaining({ id: DEVICE_A, name: "Alpha" }),
    ]);
  });

  it("rejects a duplicate request", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });

    expect((await requestPeer(app, DEVICE_B)).status).toBe(201);
    const duplicate = await requestPeer(app, DEVICE_B);

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "request_exists" });
  });

  it("does not reveal non-local, invisible, missing, or self devices", async () => {
    const app = makeApp();
    await register(app);
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await register(app, {
      deviceId: DEVICE_C,
      secret: SECRET_C,
      ip: DEFAULT_IP,
    });
    await env.DB.prepare("UPDATE devices SET invisible = 1 WHERE id = ?")
      .bind(DEVICE_C)
      .run();

    for (const target of [DEVICE_B, DEVICE_C, "missing-device-1", DEVICE_A]) {
      const response = await requestPeer(app, target);
      expect(response.status).toBe(404);
    }
  });


  it("rejects malformed request bodies", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });

    const malformed = await api(app, "/api/peers/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "{",
    });
    expect(malformed.status).toBe(400);

    const nullBody = await post(app, "/api/peers/request", null);
    expect(nullBody.status).toBe(400);
  });

  it("rejects malformed respond bodies", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });

    const malformed = await api(app, "/api/peers/respond", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_B, SECRET_B),
      },
      body: "{",
    });
    expect(malformed.status).toBe(400);

    const nullBody = await post(
      app,
      "/api/peers/respond",
      null,
      DEVICE_B,
      SECRET_B,
    );
    expect(nullBody.status).toBe(400);
  });

  it("handles a requester that disappeared before acceptance", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await requestPeer(app, DEVICE_B);
    await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(DEVICE_A).run();

    const response = await respond(app, DEVICE_A, true);

    expect(response.status).toBe(404);
  });


  it("pushes peer.request and peer.linked over the socket", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    const { socket } = await openSocket(app, DEVICE_B, SECRET_B);

    const requestEvent = nextSocketEvent(socket, "peer.request");
    await requestPeer(app, DEVICE_B);
    await expect(requestEvent).resolves.toMatchObject({
      type: "peer.request",
      from: { id: DEVICE_A, name: "Alpha" },
    });

    const linkedEvent = nextSocketEvent(socket, "peer.linked");
    await respond(app, DEVICE_A, true);
    await expect(linkedEvent).resolves.toMatchObject({
      type: "peer.linked",
      peer: { id: DEVICE_A, name: "Alpha" },
    });
  });


  it("rejects a device that is already linked", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await env.DB.prepare(
      "INSERT INTO peers (device_a, device_b, created_at) VALUES (?, ?, ?)",
    )
      .bind(DEVICE_A, DEVICE_B, 0)
      .run();

    const response = await requestPeer(app, DEVICE_B);

    expect(response.status).toBe(409);
  });

  it("requires auth and a valid body", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });

    const unauthenticated = await api(app, "/api/peers/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toDeviceId: DEVICE_B }),
    });
    expect(unauthenticated.status).toBe(401);

    const invalid = await post(app, "/api/peers/request", {});
    expect(invalid.status).toBe(400);
  });
});

describe("POST /api/peers/respond", () => {
  it("accepts a request and links both devices", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await requestPeer(app, DEVICE_B);

    const response = await respond(app, DEVICE_A, true);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      linked: boolean;
      peer: Record<string, unknown>;
    };
    expect(body.linked).toBe(true);
    expect(body.peer).toMatchObject({ id: DEVICE_A, name: "Alpha" });

    const peerRow = await env.DB.prepare(
      "SELECT device_a, device_b FROM peers",
    ).first<{ device_a: string; device_b: string }>();
    expect(peerRow).toEqual({ device_a: DEVICE_A, device_b: DEVICE_B });

    const requestCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM peer_requests",
    ).first<{ count: number }>();
    expect(requestCount?.count).toBe(0);

    const peers = await api(app, "/api/peers", {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    const peersBody = (await peers.json()) as { linked: Array<{ id: string }> };
    expect(peersBody.linked.map((peer) => peer.id)).toEqual([DEVICE_B]);
  });

  it("rejects a request without linking", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await requestPeer(app, DEVICE_B);

    const response = await respond(app, DEVICE_A, false);

    expect(await response.json()).toEqual({ linked: false });
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM peers",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it("rejects missing requests and invalid bodies", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });

    expect((await respond(app, DEVICE_A, true)).status).toBe(404);

    const invalid = await post(
      app,
      "/api/peers/respond",
      { fromDeviceId: DEVICE_A, accept: "yes" },
      DEVICE_B,
      SECRET_B,
    );
    expect(invalid.status).toBe(400);
  });
});

describe("peer request limits and TTL", () => {
  it("limits outgoing requests per sender", async () => {
    const app = createApp({ now: () => NOW, peerRequestLimitPerHour: 1 });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await register(app, { deviceId: DEVICE_C, secret: SECRET_C });

    expect((await requestPeer(app, DEVICE_B)).status).toBe(201);
    const limited = await requestPeer(app, DEVICE_C);

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
  });

  it("limits pending requests per receiver", async () => {
    const app = createApp({ now: () => NOW, maxPendingPeerRequests: 1 });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await register(app, { deviceId: DEVICE_C, secret: SECRET_C });

    expect((await requestPeer(app, DEVICE_B)).status).toBe(201);
    const limited = await post(
      app,
      "/api/peers/request",
      { toDeviceId: DEVICE_B },
      DEVICE_C,
      SECRET_C,
    );

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "too_many_requests" });
  });

  it("expires pending requests after the TTL", async () => {
    const app = createApp({ now: () => NOW, peerRequestTtlHours: 1 });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    expect((await requestPeer(app, DEVICE_B)).status).toBe(201);

    const later = createApp({ now: () => NOW + 3_600_001, peerRequestTtlHours: 1 });
    const peers = await api(later, "/api/peers", {
      headers: authHeaders(DEVICE_B, SECRET_B),
    });
    expect(await peers.json()).toMatchObject({ incomingRequests: [] });

    expect((await requestPeer(later, DEVICE_B)).status).toBe(201);
  });
});

describe("DELETE /api/peers/:id", () => {
  it("unlinks devices and removes message access", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await requestPeer(app, DEVICE_B);
    await respond(app, DEVICE_A, true);

    const removed = await api(app, `/api/peers/${DEVICE_B}`, {
      method: "DELETE",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(removed.status).toBe(204);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM peers",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);

    const messages = await api(app, `/api/chats/${DEVICE_B}/messages`, {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(messages.status).toBe(403);
  });
});
