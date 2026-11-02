import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { sha256Hex } from "../src/crypto";
import {
  DEVICE_A,
  NOW,
  SECRET_A,
  api,
  authHeaders,
  issueWsTicket,
  makeApp,
  register,
} from "./helpers";

const WS_URL = "https://dropchat.test/api/ws";

describe("POST /api/ws-ticket", () => {
  it("issues a one-time ticket with a 30 second TTL and stores only its hash", async () => {
    const app = createApp({
      now: () => NOW,
      ticketFactory: () => "ticket-abc",
    });
    await register(app);

    const response = await api(app, "/api/ws-ticket", {
      method: "POST",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ticket: "ticket-abc", expiresAt: NOW + 30_000 });
    expect(JSON.stringify(body)).not.toContain(SECRET_A);

    const row = await env.DB.prepare(
      "SELECT ticket_hash, device_id, expires_at, used FROM ws_tickets",
    ).first<{
      ticket_hash: string;
      device_id: string;
      expires_at: number;
      used: number;
    }>();

    expect(row?.ticket_hash).toBe(await sha256Hex("ticket-abc"));
    expect(row?.ticket_hash).not.toBe("ticket-abc");
    expect(row?.device_id).toBe(DEVICE_A);
    expect(row?.expires_at).toBe(NOW + 30_000);
    expect(row?.used).toBe(0);
  });

  it("requires device authentication", async () => {
    const response = await api(makeApp(), "/api/ws-ticket", { method: "POST" });

    expect(response.status).toBe(401);
  });
});

describe("GET /api/ws", () => {
  it("accepts a valid ticket once", async () => {
    const app = makeApp();
    await register(app);
    const { ticket } = await issueWsTicket(app, DEVICE_A, SECRET_A);

    const first = await app.request(
      `${WS_URL}?ticket=${encodeURIComponent(ticket)}`,
      { headers: { Upgrade: "websocket" } },
      env,
    );
    expect(first.status).toBe(101);
    expect(first.webSocket).not.toBeNull();
    first.webSocket?.accept();
    first.webSocket?.close(1000, "done");

    const second = await app.request(
      `${WS_URL}?ticket=${encodeURIComponent(ticket)}`,
      { headers: { Upgrade: "websocket" } },
      env,
    );
    expect(second.status).toBe(401);
  });

  it("rejects expired and missing tickets", async () => {
    const issuingApp = makeApp(NOW);
    await register(issuingApp);
    const { ticket } = await issueWsTicket(issuingApp, DEVICE_A, SECRET_A);

    const expired = await makeApp(NOW + 30_000).request(
      `${WS_URL}?ticket=${encodeURIComponent(ticket)}`,
      { headers: { Upgrade: "websocket" } },
      env,
    );
    expect(expired.status).toBe(401);

    const missing = await makeApp(NOW).request(WS_URL, {
      headers: { Upgrade: "websocket" },
    }, env);
    expect(missing.status).toBe(401);

    const invalid = await makeApp(NOW).request(`${WS_URL}?ticket=nope`, {
      headers: { Upgrade: "websocket" },
    }, env);
    expect(invalid.status).toBe(401);
  });

  it("accepts a ticket just before the 30 second boundary", async () => {
    const issuingApp = makeApp(NOW);
    await register(issuingApp);
    const { ticket } = await issueWsTicket(issuingApp, DEVICE_A, SECRET_A);

    const response = await makeApp(NOW + 29_999).request(
      `${WS_URL}?ticket=${encodeURIComponent(ticket)}`,
      { headers: { Upgrade: "websocket" } },
      env,
    );

    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close(1000, "done");
  });

  it("requires an Upgrade: websocket request", async () => {
    const app = makeApp();
    await register(app);
    const { ticket } = await issueWsTicket(app, DEVICE_A, SECRET_A);

    const response = await app.request(
      `${WS_URL}?ticket=${encodeURIComponent(ticket)}`,
      {},
      env,
    );

    expect(response.status).toBe(426);
  });
});
