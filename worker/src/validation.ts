export interface Registration {
  deviceId: string;
  secret: string;
  name: string;
  platform: string;
}

export type RegistrationResult =
  | { ok: true; value: Registration }
  | { ok: false };

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const DEFAULT_DEVICE_NAME = "Устройство";
const DEFAULT_PLATFORM = "web";

export function parseRegistration(input: unknown): RegistrationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false };
  }

  const record = input as Record<string, unknown>;
  if (!isStringMatching(record.deviceId, DEVICE_ID_PATTERN)) {
    return { ok: false };
  }
  if (!isStringMatching(record.secret, SECRET_PATTERN)) {
    return { ok: false };
  }

  const rawName = record.name;
  const name = rawName === undefined ? DEFAULT_DEVICE_NAME : rawName;
  if (typeof name !== "string") {
    return { ok: false };
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 64) {
    return { ok: false };
  }

  const rawPlatform = record.platform;
  const platform = rawPlatform === undefined ? DEFAULT_PLATFORM : rawPlatform;
  if (typeof platform !== "string") {
    return { ok: false };
  }
  const trimmedPlatform = platform.trim();
  if (trimmedPlatform.length === 0 || trimmedPlatform.length > 32) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      deviceId: record.deviceId,
      secret: record.secret,
      name: trimmedName,
      platform: trimmedPlatform,
    },
  };
}

function isStringMatching(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.test(value);
}
