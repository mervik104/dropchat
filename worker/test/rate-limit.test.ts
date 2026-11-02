import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  DEFAULT_MESSAGE_LIMIT_PER_MINUTE,
  DEFAULT_PROFILE_LIMIT_PER_HOUR,
  DEFAULT_REGISTRATION_LIMIT_PER_HOUR,
  DEFAULT_WS_TICKET_LIMIT_PER_MINUTE,
  parseLimit,
  parseRegistrationLimit,
} from "../src/rate-limit";
import {
  DEFAULT_IP,
  DEVICE_A,
  DEVICE_B,
  NOW,
  OTHER_IP,
  SECRET_A,
  SECRET_B,
  api,
  authHeaders,
  linkDevices,
  register,
} from "./helpers";

describe("registration rate limit config", () => {
  it("defaults to 20 registrations per hour", () => {
    expect(DEFAULT_REGISTRATION_LIMIT_PER_HOUR).toBe(20);
    expect(parseRegistrationLimit(undefined)).toBe(20);
  });

  it("parses a positive integer from the environment", () => {
    expect(parseRegistrationLimit("7")).toBe(7);
  });

  it.each(["0", "-1", "1.5", "abc", ""])(
    "falls back for invalid value %s",
    (value) => {
      expect(parseRegistrationLimit(value)).toBe(
        DEFAULT_REGISTRATION_LIMIT_PER_HOUR,
      );
    },
  );
});

describe("POST /api/devices rate limit", () => {
  it("limits registrations per ip_group and resets in the next hour", async () => {
    const app = createApp({ now: () => NOW, registrationLimit: 3 });

    for (let index = 1; index <= 3; index += 1) {
      const response = await register(app, {
        deviceId: `rate-device-000${index}`,
        secret: SECRET_A,
        name: `Rate ${index}`,
        ip: DEFAULT_IP,
      });
      expect(response.status).toBe(201);
    }

    const limited = await register(app, {
      deviceId: "rate-device-0004",
      secret: SECRET_A,
      name: "Rate 4",
      ip: DEFAULT_IP,
    });

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await limited.json()).toEqual({ error: "rate_limited" });

    const otherIp = await register(app, {
      deviceId: "rate-device-0005",
      secret: SECRET_A,
      name: "Rate 5",
      ip: OTHER_IP,
    });
    expect(otherIp.status).toBe(201);

    const nextHour = createApp({
      now: () => NOW + 3_600_000,
      registrationLimit: 3,
    });
    const reset = await register(nextHour, {
      deviceId: "rate-device-0006",
      secret: SECRET_A,
      name: "Rate 6",
      ip: DEFAULT_IP,
    });
    expect(reset.status).toBe(201);
  });

  it("uses the env-configured limit by default", async () => {
    const app = createApp({ now: () => NOW });

    const response = await register(app, {
      deviceId: DEVICE_A,
      secret: SECRET_A,
      name: "Env limit",
      ip: DEFAULT_IP,
    });

    expect(response.status).toBe(201);
  });
});

describe("endpoint rate limit config", () => {
  it("exposes the documented defaults", () => {
    expect(DEFAULT_MESSAGE_LIMIT_PER_MINUTE).toBe(60);
    expect(DEFAULT_WS_TICKET_LIMIT_PER_MINUTE).toBe(30);
    expect(DEFAULT_PROFILE_LIMIT_PER_HOUR).toBe(30);
  });

  it("parses positive limits and falls back for invalid values", () => {
    expect(parseLimit("7", 10)).toBe(7);
    expect(parseLimit(undefined, 10)).toBe(10);
    expect(parseLimit("0", 10)).toBe(10);
    expect(parseLimit("1.5", 10)).toBe(10);
    expect(parseLimit("abc", 10)).toBe(10);
  });
});

describe("endpoint write rate limits", () => {
  it("limits text messages per device per minute and allows other devices", async () => {
    const app = createApp({ now: () => NOW, messageLimitPerMinute: 1 });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const first = await api(
      app,
      `/api/chats/${DEVICE_B}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body: JSON.stringify({
          kind: "text",
          text: "one",
          clientId: "msg-limit-1",
        }),
      },
    );
    expect(first.status).toBe(201);

    const limited = await api(
      app,
      `/api/chats/${DEVICE_B}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body: JSON.stringify({
          kind: "text",
          text: "two",
          clientId: "msg-limit-2",
        }),
      },
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");

    const otherDevice = await api(
      app,
      `/api/chats/${DEVICE_A}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_B, SECRET_B),
        },
        body: JSON.stringify({
          kind: "text",
          text: "from b",
          clientId: "msg-limit-3",
        }),
      },
    );
    expect(otherDevice.status).toBe(201);

    const nextMinute = createApp({
      now: () => NOW + 60_000,
      messageLimitPerMinute: 1,
    });
    const reset = await api(
      nextMinute,
      `/api/chats/${DEVICE_B}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body: JSON.stringify({
          kind: "text",
          text: "next",
          clientId: "msg-limit-4",
        }),
      },
    );
    expect(reset.status).toBe(201);
  });

  it("limits ws tickets", async () => {
    const app = createApp({ now: () => NOW, wsTicketLimitPerMinute: 1 });
    await register(app);

    const first = await api(app, "/api/ws-ticket", {
      method: "POST",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(first.status).toBe(200);

    const limited = await api(app, "/api/ws-ticket", {
      method: "POST",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });

  it("limits profile updates", async () => {
    const app = createApp({ now: () => NOW, profileLimitPerHour: 1 });
    await register(app);

    const first = await api(app, "/api/devices/me", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: JSON.stringify({ name: "One" }),
    });
    expect(first.status).toBe(200);

    const limited = await api(app, "/api/devices/me", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: JSON.stringify({ name: "Two" }),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
  });
});
