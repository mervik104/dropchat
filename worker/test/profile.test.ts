import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  DEVICE_A,
  NOW,
  SECRET_A,
  api,
  authHeaders,
  makeApp,
  register,
} from "./helpers";

function authPatch(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...authHeaders(DEVICE_A, SECRET_A),
    },
    body: JSON.stringify(body),
  };
}

describe("PATCH /api/devices/me", () => {
  it("updates the device name and returns a safe profile", async () => {
    const app = makeApp();
    await register(app, { name: "Old Name" });

    const response = await api(app, "/api/devices/me", authPatch({ name: "  New Name  " }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: DEVICE_A,
      name: "New Name",
      invisible: false,
      createdAt: NOW,
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_A);
    expect(JSON.stringify(body)).not.toContain("secret_hash");
    expect(JSON.stringify(body)).not.toContain("ip_group");

    const row = await env.DB.prepare("SELECT name FROM devices WHERE id = ?")
      .bind(DEVICE_A)
      .first<{ name: string }>();
    expect(row?.name).toBe("New Name");
  });

  it("updates invisible mode", async () => {
    const app = makeApp();
    await register(app);

    const response = await api(
      app,
      "/api/devices/me",
      authPatch({ invisible: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ invisible: true });

    const row = await env.DB.prepare(
      "SELECT invisible FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ invisible: number }>();
    expect(row?.invisible).toBe(1);
  });

  it("updates name and invisible together", async () => {
    const app = makeApp();
    await register(app);

    const response = await api(
      app,
      "/api/devices/me",
      authPatch({ name: "Both", invisible: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Both",
      invisible: true,
    });
  });

  it("requires authentication", async () => {
    const response = await api(makeApp(), "/api/devices/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects malformed JSON", async () => {
    const app = makeApp();
    await register(app);

    const response = await api(app, "/api/devices/me", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it.each([
    ["empty object", {}],
    ["null", null],
    ["array", []],
    ["empty name", { name: "   " }],
    ["long name", { name: "x".repeat(65) }],
    ["non-string name", { name: 123 }],
    ["non-boolean invisible", { invisible: "true" }],
    ["numeric invisible", { invisible: 1 }],
  ])("rejects invalid update: %s", async (_label, body) => {
    const app = makeApp();
    await register(app);

    const response = await api(app, "/api/devices/me", authPatch(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
