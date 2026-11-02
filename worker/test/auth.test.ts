import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { parseAuthorization } from "../src/auth";
import { constantTimeEqual } from "../src/crypto";
import {
  DEVICE_A,
  DEVICE_B,
  DEFAULT_IP,
  NOW,
  OTHER_IP,
  SECRET_A,
  api,
  authHeaders,
  makeApp,
  register,
} from "./helpers";

async function testSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("parseAuthorization", () => {
  it("parses the Bearer device token case-insensitively", () => {
    expect(parseAuthorization(`bearer ${DEVICE_A}.${SECRET_A}`)).toEqual({
      deviceId: DEVICE_A,
      secret: SECRET_A,
    });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["wrong scheme", `Basic ${DEVICE_A}.${SECRET_A}`],
    ["missing token", "Bearer"],
    ["missing dot", `Bearer ${DEVICE_A}`],
    ["short device id", `Bearer short.${SECRET_A}`],
    ["short secret", `Bearer ${DEVICE_A}.short`],
    ["extra segment", `Bearer ${DEVICE_A}.${SECRET_A}.extra`],
  ])("rejects malformed header: %s", (_label, header) => {
    expect(parseAuthorization(header)).toBeNull();
  });

  it("compares tokens without early equality shortcuts", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("authentication middleware", () => {
  it("rejects a missing Authorization header", async () => {
    const response = await api(makeApp(), "/api/peers");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it.each([
    ["wrong scheme", `Basic ${DEVICE_A}.${SECRET_A}`],
    ["malformed token", "Bearer broken"],
    ["extra segment", `Bearer ${DEVICE_A}.${SECRET_A}.extra`],
  ])("rejects an invalid token: %s", async (_label, authorization) => {
    const response = await api(makeApp(), "/api/peers", {
      headers: { Authorization: authorization },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects an unknown device", async () => {
    const response = await api(makeApp(), "/api/peers", {
      headers: authHeaders(DEVICE_B, SECRET_A),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects a wrong secret without echoing it", async () => {
    const app = makeApp();
    await register(app);
    const wrongSecret = "z".repeat(43);

    const response = await api(app, "/api/peers", {
      headers: authHeaders(DEVICE_A, wrongSecret),
    });

    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(wrongSecret);
  });

  it("authorizes a valid device and refreshes ip_group and last_seen", async () => {
    await register(makeApp(), { ip: DEFAULT_IP });
    const later = NOW + 5_000;

    const response = await api(
      makeApp(later),
      "/api/peers",
      { headers: authHeaders(DEVICE_A, SECRET_A) },
      OTHER_IP,
    );

    expect(response.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT ip_group, last_seen FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ ip_group: string; last_seen: number }>();

    expect(row?.last_seen).toBe(later);
    expect(row?.ip_group).toBe(await testSha256(`test-server-salt${OTHER_IP}`));
  });

  it("skips the write when last_seen is fresh and ip_group is unchanged", async () => {
    await register(makeApp(), { ip: DEFAULT_IP });
    const freshLastSeen = NOW - 14_999;
    await env.DB.prepare("UPDATE devices SET last_seen = ? WHERE id = ?")
      .bind(freshLastSeen, DEVICE_A)
      .run();

    const response = await api(
      makeApp(NOW),
      "/api/peers",
      { headers: authHeaders(DEVICE_A, SECRET_A) },
      DEFAULT_IP,
    );

    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT last_seen FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ last_seen: number }>();
    expect(row?.last_seen).toBe(freshLastSeen);
  });

  it("writes at the exact 15 second boundary", async () => {
    await register(makeApp(), { ip: DEFAULT_IP });
    await env.DB.prepare("UPDATE devices SET last_seen = ? WHERE id = ?")
      .bind(NOW - 15_000, DEVICE_A)
      .run();

    const response = await api(
      makeApp(NOW),
      "/api/peers",
      { headers: authHeaders(DEVICE_A, SECRET_A) },
      DEFAULT_IP,
    );

    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT last_seen FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ last_seen: number }>();
    expect(row?.last_seen).toBe(NOW);
  });

  it("writes immediately when ip_group changes, even inside the throttle window", async () => {
    await register(makeApp(), { ip: DEFAULT_IP });
    await env.DB.prepare("UPDATE devices SET last_seen = ? WHERE id = ?")
      .bind(NOW - 1, DEVICE_A)
      .run();

    const response = await api(
      makeApp(NOW),
      "/api/peers",
      { headers: authHeaders(DEVICE_A, SECRET_A) },
      OTHER_IP,
    );

    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT ip_group, last_seen FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ ip_group: string; last_seen: number }>();
    expect(row?.last_seen).toBe(NOW);
    expect(row?.ip_group).toBe(await testSha256(`test-server-salt${OTHER_IP}`));
  });

  it("uses a stable group when CF-Connecting-IP is absent", async () => {
    await register(makeApp());
    const response = await api(
      makeApp(),
      "/api/peers",
      { headers: authHeaders(DEVICE_A, SECRET_A) },
      null,
    );

    expect(response.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT ip_group FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ ip_group: string }>();

    expect(row?.ip_group).toBe(await testSha256("test-server-saltunknown"));
  });

  it("does not update a device on failed authentication", async () => {
    const app = makeApp();
    await register(app);
    const later = NOW + 5_000;

    await api(
      makeApp(later),
      "/api/peers",
      { headers: authHeaders(DEVICE_A, "z".repeat(43)) },
      OTHER_IP,
    );

    const row = await env.DB.prepare(
      "SELECT ip_group, last_seen FROM devices WHERE id = ?",
    )
      .bind(DEVICE_A)
      .first<{ ip_group: string; last_seen: number }>();

    expect(row?.last_seen).toBe(NOW);
    expect(row?.ip_group).toBe(await testSha256(`test-server-salt${DEFAULT_IP}`));
  });
});
