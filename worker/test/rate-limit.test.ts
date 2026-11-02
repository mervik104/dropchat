import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  DEFAULT_REGISTRATION_LIMIT_PER_HOUR,
  parseRegistrationLimit,
} from "../src/rate-limit";
import {
  DEFAULT_IP,
  DEVICE_A,
  NOW,
  OTHER_IP,
  SECRET_A,
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
