import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import type { Env } from "../src/env";
import { Hub } from "../src/hub";
import { DEVICE_A, makeApp, register } from "./helpers";

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

describe("Hub internals", () => {
  it("rejects a WebSocket upgrade without a trusted device header", async () => {
    const stub = env.HUB.get(env.HUB.idFromName("no-device"));

    const response = await stub.fetch("https://hub.test/ws", {
      headers: { Upgrade: "websocket" },
    });

    expect(response.status).toBe(401);
  });

  it("handles missing devices and socket errors without failing", async () => {
    const socket = {
      deserializeAttachment: () => ({ deviceId: "missing-device" }),
      send: vi.fn(),
    } as unknown as WebSocket;
    const ctx = {
      getWebSockets: () => [socket],
    } as unknown as DurableObjectState;
    const hub = new Hub(ctx, env);

    await expect(
      hub.fetch(new Request("https://hub/refresh", { method: "POST" })),
    ).resolves.toMatchObject({ status: 200 });
    await expect(hub.webSocketError(socket)).resolves.toBeUndefined();
  });

  it("falls back to a 24 hour peer-request window", async () => {
    await register(makeApp(), { deviceId: DEVICE_A, name: "Alpha" });
    const socket = {
      deserializeAttachment: () => ({ deviceId: DEVICE_A }),
      send: vi.fn(),
    } as unknown as WebSocket;
    const ctx = {
      getWebSockets: () => [socket],
    } as unknown as DurableObjectState;
    const hub = new Hub(ctx, {
      ...env,
      PEER_REQUEST_TTL_HOURS: "invalid",
    } as Env);

    await expect(
      hub.fetch(new Request("https://hub/refresh", { method: "POST" })),
    ).resolves.toMatchObject({ status: 200 });
    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining("peers.snapshot"),
    );
  });
});
