import { describe, expect, it, vi } from "vitest";

import {
  IDENTITY_STORAGE_KEY,
  InvalidIdentityError,
  createIdentityStore,
  ensureIdentity,
  generateIdentity,
  parseIdentityExport,
  serializeIdentity,
  type DeviceIdentity,
  type RandomSource,
} from "./identity";

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const identity: DeviceIdentity = {
  deviceId: "11111111-1111-4111-8111-111111111111",
  secret: "A".repeat(43),
  name: "Мой Mac",
  platform: "web",
};

const random: RandomSource = {
  uuid: () => "22222222-2222-4222-8222-222222222222",
  bytes: (length) => new Uint8Array(length),
};

describe("generateIdentity", () => {
  it("creates a server-compatible id and base64url secret", () => {
    const generated = generateIdentity(random, "Мой Mac", "web");

    expect(generated).toEqual({
      deviceId: "22222222-2222-4222-8222-222222222222",
      secret: "A".repeat(43),
      name: "Мой Mac",
      platform: "web",
    });
  });
});

describe("identity storage", () => {
  it("returns null when no identity is stored", async () => {
    const store = createIdentityStore(createStorage());
    await expect(store.load()).resolves.toBeNull();
  });

  it("loads a valid stored identity", async () => {
    const store = createIdentityStore(
      createStorage({ [IDENTITY_STORAGE_KEY]: JSON.stringify(identity) }),
    );
    await expect(store.load()).resolves.toEqual(identity);
  });

  it.each([
    ["invalid json", "{"],
    ["null", "null"],
    ["primitive", "\"hello\""],
    ["empty object", "{}"],
    ["non-string field", JSON.stringify({ ...identity, deviceId: 1 })],
    ["empty field", JSON.stringify({ ...identity, secret: "" })],
  ])("ignores corrupted storage: %s", async (_label, raw) => {
    const store = createIdentityStore(createStorage({ [IDENTITY_STORAGE_KEY]: raw }));
    await expect(store.load()).resolves.toBeNull();
  });

  it("persists an identity as JSON", async () => {
    const storage = createStorage();
    const store = createIdentityStore(storage);

    await store.save(identity);

    expect(storage.getItem(IDENTITY_STORAGE_KEY)).toBe(JSON.stringify(identity));
  });
});

describe("ensureIdentity", () => {
  it("reuses an existing identity without writing", async () => {
    const store = {
      load: vi.fn(async () => identity),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    };

    await expect(ensureIdentity(store, random, "Мой Mac", "web")).resolves.toEqual(
      identity,
    );
    expect(store.save).not.toHaveBeenCalled();
  });

  it("creates and stores a new identity", async () => {
    const store = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
    };

    const created = await ensureIdentity(store, random, "Мой Mac", "web");

    expect(created.deviceId).toBe("22222222-2222-4222-8222-222222222222");
    expect(store.save).toHaveBeenCalledWith(created);
  });
});

describe("identity export and import", () => {
  it("round-trips an identity as text", () => {
    const text = serializeIdentity(identity);

    expect(parseIdentityExport(text)).toEqual(identity);
  });

  it("includes a version in the exported text", () => {
    expect(JSON.parse(serializeIdentity(identity))).toMatchObject({
      version: 1,
      deviceId: identity.deviceId,
    });
  });

  it.each([
    ["invalid json", "{"],
    ["null", "null"],
    ["array", "[]"],
    ["wrong version", JSON.stringify({ version: 2, ...identity })],
    ["missing field", JSON.stringify({ version: 1, deviceId: identity.deviceId })],
    [
      "empty field",
      JSON.stringify({ version: 1, ...identity, secret: "" }),
    ],
  ])("rejects invalid import text: %s", (_label, text) => {
    expect(() => parseIdentityExport(text)).toThrow(InvalidIdentityError);
  });

  it("clears the stored identity", async () => {
    const storage = createStorage({ [IDENTITY_STORAGE_KEY]: JSON.stringify(identity) });
    const store = createIdentityStore(storage);

    await store.clear();

    expect(storage.getItem(IDENTITY_STORAGE_KEY)).toBeNull();
  });
});
