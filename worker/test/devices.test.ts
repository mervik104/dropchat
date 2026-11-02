import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  DEVICE_A,
  DEVICE_B,
  DEFAULT_IP,
  NOW,
  SECRET_A,
  SECRET_B,
  api,
  jsonRequest,
  makeApp,
  register,
} from "./helpers";

interface DeviceProfileBody {
  id: string;
  name: string;
  platform: string;
  invisible: boolean;
  lastSeen: number;
  createdAt: number;
}

async function testSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("POST /api/devices", () => {
  it("registers a device and stores only the secret hash", async () => {
    const app = makeApp();

    const response = await register(app, {
      name: "My Mac",
      platform: "macos",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as DeviceProfileBody;
    expect(body).toEqual({
      id: DEVICE_A,
      name: "My Mac",
      platform: "macos",
      invisible: false,
      lastSeen: NOW,
      createdAt: NOW,
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_A);
    expect(JSON.stringify(body)).not.toContain("secret_hash");
    expect(JSON.stringify(body)).not.toContain("ip_group");

    const row = await env.DB.prepare(
      "SELECT secret_hash, ip_group, last_seen, created_at FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{
        secret_hash: string;
        ip_group: string;
        last_seen: number;
        created_at: number;
      }>();

    expect(row).not.toBeNull();
    expect(row?.secret_hash).toBe(await testSha256(SECRET_A));
    expect(row?.secret_hash).not.toBe(SECRET_A);
    expect(row?.ip_group).toBe(await testSha256(`test-server-salt${DEFAULT_IP}`));
    expect(row?.last_seen).toBe(NOW);
    expect(row?.created_at).toBe(NOW);
  });

  it("uses defaults for optional name and platform", async () => {
    const response = await api(
      makeApp(),
      "/api/devices",
      jsonRequest({ deviceId: DEVICE_B, secret: SECRET_B }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as DeviceProfileBody;
    expect(body.name).toBe("Устройство");
    expect(body.platform).toBe("web");
  });

  it("registers a device when CF-Connecting-IP is absent", async () => {
    const response = await api(
      makeApp(),
      "/api/devices",
      jsonRequest({ deviceId: DEVICE_A, secret: SECRET_A }),
      null,
    );

    expect(response.status).toBe(201);

    const row = await env.DB.prepare(
      "SELECT ip_group FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ ip_group: string }>();

    expect(row?.ip_group).toBe(await testSha256("test-server-saltunknown"));
  });

  it("trims the device name and platform", async () => {
    const response = await register(makeApp(), {
      name: "  My PC  ",
      platform: "  windows  ",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as DeviceProfileBody;
    expect(body.name).toBe("My PC");
    expect(body.platform).toBe("windows");
  });

  it("rejects a duplicate device id", async () => {
    const app = makeApp();

    expect((await register(app)).status).toBe(201);
    const duplicate = await register(app, {
      name: "Duplicate",
      secret: "z".repeat(43),
    });

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "device_exists" });
  });

  it("rejects malformed JSON", async () => {
    const response = await api(makeApp(), "/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it.each([
    ["null", null],
    ["array", []],
    ["primitive", "hello"],
    ["missing device id", { secret: SECRET_A, name: "A", platform: "web" }],
    ["short device id", { deviceId: "short", secret: SECRET_A }],
    ["invalid device id", { deviceId: "device id 0001", secret: SECRET_A }],
    ["missing secret", { deviceId: DEVICE_A, name: "A", platform: "web" }],
    ["short secret", { deviceId: DEVICE_A, secret: "short" }],
    [
      "invalid secret",
      { deviceId: DEVICE_A, secret: `${"a".repeat(42)}.` },
    ],
    [
      "empty name",
      { deviceId: DEVICE_A, secret: SECRET_A, name: "   ", platform: "web" },
    ],
    [
      "long name",
      {
        deviceId: DEVICE_A,
        secret: SECRET_A,
        name: "x".repeat(65),
        platform: "web",
      },
    ],
    [
      "non-string name",
      { deviceId: DEVICE_A, secret: SECRET_A, name: 123, platform: "web" },
    ],
    [
      "empty platform",
      { deviceId: DEVICE_A, secret: SECRET_A, name: "A", platform: "  " },
    ],
    [
      "long platform",
      {
        deviceId: DEVICE_A,
        secret: SECRET_A,
        name: "A",
        platform: "x".repeat(33),
      },
    ],
    [
      "non-string platform",
      { deviceId: DEVICE_A, secret: SECRET_A, name: "A", platform: 123 },
    ],
  ])("rejects invalid registration body: %s", async (_label, body) => {
    const response = await api(makeApp(), "/api/devices", jsonRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });
});
