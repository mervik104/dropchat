export const IDENTITY_STORAGE_KEY = "dropchat.identity.v1";
export const IDENTITY_EXPORT_VERSION = 1;

export interface DeviceIdentity {
  deviceId: string;
  secret: string;
  name: string;
  platform: string;
}

export interface RandomSource {
  uuid(): string;
  bytes(length: number): Uint8Array;
}

export interface IdentityStore {
  load(): Promise<DeviceIdentity | null>;
  save(identity: DeviceIdentity): Promise<void>;
  clear(): Promise<void>;
}

export class InvalidIdentityError extends Error {
  constructor() {
    super("invalid_identity");
    this.name = "InvalidIdentityError";
  }
}

export function generateIdentity(
  random: RandomSource,
  name: string,
  platform: string,
): DeviceIdentity {
  return {
    deviceId: random.uuid(),
    secret: toBase64Url(random.bytes(32)),
    name,
    platform,
  };
}

export function createIdentityStore(storage: Storage): IdentityStore {
  return {
    async load(): Promise<DeviceIdentity | null> {
      const raw = storage.getItem(IDENTITY_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      try {
        const value = JSON.parse(raw) as unknown;
        return isDeviceIdentity(value) ? value : null;
      } catch {
        return null;
      }
    },

    async save(identity: DeviceIdentity): Promise<void> {
      storage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    },

    async clear(): Promise<void> {
      storage.removeItem(IDENTITY_STORAGE_KEY);
    },
  };
}

export function serializeIdentity(identity: DeviceIdentity): string {
  return JSON.stringify({ version: IDENTITY_EXPORT_VERSION, ...identity }, null, 2);
}

export function parseIdentityExport(text: string): DeviceIdentity {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidIdentityError();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidIdentityError();
  }

  const record = value as Record<string, unknown>;
  if (record.version !== IDENTITY_EXPORT_VERSION || !isDeviceIdentity(record)) {
    throw new InvalidIdentityError();
  }

  return {
    deviceId: record.deviceId,
    secret: record.secret,
    name: record.name,
    platform: record.platform,
  };
}

export async function ensureIdentity(
  store: IdentityStore,
  random: RandomSource,
  name: string,
  platform: string,
): Promise<DeviceIdentity> {
  const existing = await store.load();
  if (existing) {
    return existing;
  }

  const created = generateIdentity(random, name, platform);
  await store.save(created);
  return created;
}

function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return ["deviceId", "secret", "name", "platform"].every(
    (key) => typeof record[key] === "string" && record[key].length > 0,
  );
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
