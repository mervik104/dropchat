import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_C,
  NOW,
  OTHER_IP,
  SECRET_A,
  SECRET_B,
  SECRET_C,
  api,
  authHeaders,
  makeApp,
  register,
} from "./helpers";

function postInvite(
  app: ReturnType<typeof makeApp>,
  deviceId = DEVICE_A,
  secret = SECRET_A,
): Promise<Response> {
  return api(app, "/api/invites", {
    method: "POST",
    headers: authHeaders(deviceId, secret),
  });
}

function redeem(
  app: ReturnType<typeof makeApp>,
  code: unknown,
  deviceId = DEVICE_B,
  secret = SECRET_B,
  ip = "203.0.113.10",
): Promise<Response> {
  return api(
    app,
    "/api/invites/redeem",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(deviceId, secret),
      },
      body: JSON.stringify({ code }),
    },
    ip,
  );
}

describe("POST /api/invites", () => {
  it("creates a six digit code with a five minute TTL", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app);

    const response = await postInvite(app);

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ code: "123456", expiresAt: NOW + 300_000 });
    expect(JSON.stringify(body)).not.toContain(SECRET_A);

    const row = await env.DB.prepare(
      "SELECT device_id, expires_at, attempts, used FROM invites WHERE code = ?",
    )
      .bind("123456")
      .first<{
        device_id: string;
        expires_at: number;
        attempts: number;
        used: number;
      }>();
    expect(row).toEqual({
      device_id: DEVICE_A,
      expires_at: NOW + 300_000,
      attempts: 0,
      used: 0,
    });
  });

  it("generates a crypto-random six digit code by default", async () => {
    const app = makeApp();
    await register(app);

    const response = await postInvite(app);
    const body = (await response.json()) as { code: string };

    expect(body.code).toMatch(/^\d{6}$/);
  });


  it("retries code collisions", async () => {
    const codes = ["123456", "123456", "654321"];
    let index = 0;
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => codes[index++]!,
    });
    await register(app);

    expect((await postInvite(app)).status).toBe(201);
    const second = await postInvite(app);

    expect(second.status).toBe(201);
    expect(await second.json()).toMatchObject({ code: "654321" });
  });

  it("fails after repeated code collisions", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app);

    expect((await postInvite(app)).status).toBe(201);
    const failed = await postInvite(app);

    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "code_generation_failed" });
  });

  it("requires authentication", async () => {
    const response = await api(makeApp(), "/api/invites", { method: "POST" });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/invites rate limit", () => {
  it("limits invite creation per device", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
      inviteCreateLimitPerHour: 1,
    });
    await register(app);

    expect((await postInvite(app)).status).toBe(201);
    const limited = await postInvite(app);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/invites/redeem", () => {
  it("links two devices and consumes the invite", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      name: "Beta",
      ip: OTHER_IP,
    });
    await postInvite(app);

    const response = await redeem(app, "123456");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      peer: Record<string, unknown>;
    };
    expect(body.peer).toMatchObject({ id: DEVICE_A, name: "Alpha" });

    const peerRow = await env.DB.prepare(
      "SELECT device_a, device_b FROM peers",
    ).first<{ device_a: string; device_b: string }>();
    expect(peerRow).toEqual({ device_a: DEVICE_A, device_b: DEVICE_B });

    const invite = await env.DB.prepare(
      "SELECT used FROM invites WHERE code = ?",
    )
      .bind("123456")
      .first<{ used: number }>();
    expect(invite?.used).toBe(1);
  });

  it("rejects expired, used, malformed, and unknown codes", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app);
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await register(app, {
      deviceId: DEVICE_C,
      secret: SECRET_C,
      ip: "192.0.2.10",
    });
    await postInvite(app);

    expect((await redeem(app, "123456")).status).toBe(200);
    expect((await redeem(app, "123456", DEVICE_C, SECRET_C)).status).toBe(404);
    expect((await redeem(app, "abcdef")).status).toBe(404);
    expect((await redeem(app, "000000")).status).toBe(404);
  });

  it("accepts at 4:59 and rejects at 5:00", async () => {
    const first = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(first);
    await register(first, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await register(first, {
      deviceId: DEVICE_C,
      secret: SECRET_C,
      ip: "192.0.2.10",
    });
    await postInvite(first);

    const justInTime = await createApp({ now: () => NOW + 299_999 }).request(
      `/api/invites/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_B, SECRET_B),
        },
        body: JSON.stringify({ code: "123456" }),
      },
      env,
    );
    expect(justInTime.status).toBe(200);

    const second = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "654321",
    });
    await postInvite(second);
    const expired = await createApp({ now: () => NOW + 300_000 }).request(
      `/api/invites/redeem`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_C, SECRET_C),
        },
        body: JSON.stringify({ code: "654321" }),
      },
      env,
    );
    expect(expired.status).toBe(404);
  });

  it("blocks a device after five failed attempts in ten minutes", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app);
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await postInvite(app);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await redeem(app, "000000")).status).toBe(404);
    }

    const blocked = await redeem(app, "123456");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");
    expect(await blocked.json()).toEqual({ error: "rate_limited" });

    const nextWindow = createApp({
      now: () => NOW + 600_000,
      inviteCodeFactory: () => "654321",
    });
    await postInvite(nextWindow);
    const reset = await nextWindow.request(
      "/api/invites/redeem",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_B, SECRET_B),
        },
        body: JSON.stringify({ code: "654321" }),
      },
      env,
    );
    expect(reset.status).toBe(200);
  });

  it("kills an invite after five failed redemption attempts", async () => {
    const app = createApp({
      now: () => NOW + 300_001,
      inviteCodeFactory: () => "123456",
    });
    const owner = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(owner);
    await register(owner, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await register(owner, {
      deviceId: DEVICE_C,
      secret: SECRET_C,
      ip: "192.0.2.10",
    });
    await postInvite(owner);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api(app, "/api/invites/redeem", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_B, SECRET_B),
        },
        body: JSON.stringify({ code: "123456" }),
      });
      expect(response.status).toBe(404);
    }

    const used = await env.DB.prepare(
      "SELECT attempts, used FROM invites WHERE code = ?",
    )
      .bind("123456")
      .first<{ attempts: number; used: number }>();
    expect(used).toEqual({ attempts: 5, used: 1 });

    const otherDevice = await api(app, "/api/invites/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_C, SECRET_C),
      },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(otherDevice.status).toBe(404);
  });


  it("rejects self-redemption and already-linked devices", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app);
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await postInvite(app);

    expect((await redeem(app, "123456", DEVICE_A, SECRET_A)).status).toBe(404);

    await env.DB.prepare(
      "INSERT INTO peers (device_a, device_b, created_at) VALUES (?, ?, ?)",
    )
      .bind(DEVICE_A, DEVICE_B, 0)
      .run();
    const linked = await redeem(app, "123456");
    expect(linked.status).toBe(409);
  });

  it("handles an invite owner that disappeared", async () => {
    const app = createApp({
      now: () => NOW,
      inviteCodeFactory: () => "123456",
    });
    await register(app);
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      ip: OTHER_IP,
    });
    await postInvite(app);
    await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(DEVICE_A).run();

    const response = await redeem(app, "123456");

    expect(response.status).toBe(404);
  });


  it("rejects malformed and non-object redeem bodies", async () => {
    const app = makeApp();
    await register(app);

    const malformed = await api(app, "/api/invites/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "{",
    });
    expect(malformed.status).toBe(400);

    const nullBody = await api(app, "/api/invites/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "null",
    });
    expect(nullBody.status).toBe(400);

    const arrayBody = await api(app, "/api/invites/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "[]",
    });
    expect(arrayBody.status).toBe(400);
  });

  it("requires auth and a string code", async () => {
    const app = makeApp();
    await register(app);

    const unauthenticated = await api(app, "/api/invites/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(unauthenticated.status).toBe(401);

    const invalid = await redeem(app, 123456, DEVICE_A, SECRET_A);
    expect(invalid.status).toBe(400);
  });
});

describe("invite brute-force protection by ip_group and globally", () => {
  it("blocks an ip_group after the configured number of failures and resets later", async () => {
    const app = createApp({
      now: () => NOW,
      inviteIpGroupFailureLimit: 3,
      inviteGlobalFailureLimit: 100,
    });
    const ids = ["brute-a-0001", "brute-b-0002", "brute-c-0003", "brute-d-0004"];
    for (const id of ids) {
      await register(app, { deviceId: id, secret: SECRET_A, ip: "203.0.113.50" });
    }

    for (const id of ids.slice(0, 3)) {
      expect((await redeem(app, "000000", id, SECRET_A)).status).toBe(404);
    }

    const blocked = await redeem(app, "000000", ids[3]!, SECRET_A);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");

    const otherIp = await register(app, {
      deviceId: "brute-e-0005",
      secret: SECRET_A,
      ip: "198.51.100.50",
    });
    expect(otherIp.status).toBe(201);
    expect(
      (await redeem(
        app,
        "000000",
        "brute-e-0005",
        SECRET_A,
        "198.51.100.50",
      )).status,
    ).toBe(404);

    await register(app, {
      deviceId: "brute-f-0006",
      secret: SECRET_A,
      ip: "203.0.113.50",
    });
    const later = createApp({
      now: () => NOW + 600_000,
      inviteIpGroupFailureLimit: 3,
    });
    expect(
      (await later.request(
        "/api/invites/redeem",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders("brute-f-0006", SECRET_A),
          },
          body: JSON.stringify({ code: "000000" }),
        },
        env,
      )).status,
    ).toBe(404);
  });

  it("trips the global circuit breaker across ip_groups and resets later", async () => {
    const app = createApp({
      now: () => NOW,
      inviteIpGroupFailureLimit: 100,
      inviteGlobalFailureLimit: 3,
    });
    await register(app, { deviceId: "global-a-0001", secret: SECRET_A, ip: "203.0.113.10" });
    await register(app, { deviceId: "global-b-0002", secret: SECRET_A, ip: "203.0.113.20" });
    await register(app, { deviceId: "global-c-0003", secret: SECRET_A, ip: "203.0.113.30" });
    await register(app, { deviceId: "global-d-0004", secret: SECRET_A, ip: "203.0.113.40" });

    for (const id of ["global-a-0001", "global-b-0002", "global-c-0003"]) {
      expect((await redeem(app, "000000", id, SECRET_A)).status).toBe(404);
    }

    expect(
      (await redeem(app, "000000", "global-d-0004", SECRET_A)).status,
    ).toBe(429);

    await register(app, { deviceId: "global-e-0005", secret: SECRET_A, ip: "203.0.113.99" });
    const later = createApp({
      now: () => NOW + 600_000,
      inviteGlobalFailureLimit: 3,
      inviteIpGroupFailureLimit: 100,
    });
    expect(
      (await later.request(
        "/api/invites/redeem",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders("global-e-0005", SECRET_A),
          },
          body: JSON.stringify({ code: "000000" }),
        },
        env,
      )).status,
    ).toBe(404);
  });
});
