import type { ChatMessage } from "@dropchat/shared";
import { describe, expect, it, vi } from "vitest";

import {
  createLocalMessageStore,
  LOCAL_MESSAGES_KEY_PREFIX,
  MAX_LOCAL_MESSAGES,
} from "./local-messages";

function storage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    chatKey: "a:b",
    fromDevice: "a",
    toDevice: "b",
    kind: "text",
    text: id,
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: "p2p",
    status: "sent",
    createdAt: 1,
    expiresAt: 10_000,
    ...overrides,
  };
}

describe("local message store", () => {
  it("stores messages per device and peer, deduplicating by id", () => {
    const raw = storage();
    const store = createLocalMessageStore(raw);

    store.append("device-a", "peer-1", message("m1"));
    store.append("device-a", "peer-1", message("m1"));
    store.append("device-a", "peer-2", message("m2"));
    store.append("device-b", "peer-1", message("other"));

    expect(store.load("device-a", 0)).toEqual({
      "peer-1": [message("m1")],
      "peer-2": [message("m2")],
    });
    expect(store.load("device-b", 0)).toEqual({ "peer-1": [message("other")] });
  });

  it("persists internet messages while keeping local copies authoritative", () => {
    const store = createLocalMessageStore(storage());
    const local = message("m1", { text: "local", transport: "p2p" });
    store.append("device-a", "peer-1", local);

    store.appendMany("device-a", "peer-1", [
      message("m1", { text: "server", transport: null }),
      message("m2", { text: "internet", transport: null }),
    ]);

    expect(store.load("device-a", 0)).toEqual({
      "peer-1": [local, message("m2", { text: "internet", transport: null })],
    });
  });

  it("drops expired messages but keeps messages without expiry", () => {
    const store = createLocalMessageStore(storage());
    store.append("device-a", "peer-1", message("expired", { expiresAt: 5 }));
    store.append("device-a", "peer-1", message("no-expiry", { expiresAt: 0 }));
    store.append("device-a", "peer-1", message("alive", { expiresAt: 20 }));
    store.append("device-a", "peer-2", message("gone", { expiresAt: 5 }));

    expect(store.load("device-a", 10)).toEqual({
      "peer-1": [message("alive", { expiresAt: 20 }), message("no-expiry", { expiresAt: 0 })],
    });
  });

  it("ignores corrupted storage and invalid records", () => {
    const raw = storage({
      [`${LOCAL_MESSAGES_KEY_PREFIX}device-a`]: "not json",
      [`${LOCAL_MESSAGES_KEY_PREFIX}device-b`]: JSON.stringify({
        version: 2,
        peers: {},
      }),
      [`${LOCAL_MESSAGES_KEY_PREFIX}device-c`]: JSON.stringify({
        version: 1,
        peers: {
          "peer-1": [{ id: 1 }],
          "peer-2": "bad",
          "peer-3": [message("ok")],
          "peer-4": [null],
          "peer-5": [
            {
              id: "bad-date",
              fromDevice: "a",
              toDevice: "b",
              kind: "text",
              createdAt: "now",
              expiresAt: 1,
            },
          ],
          "peer-6": [
            { ...message("bad-from"), fromDevice: 1 },
            { ...message("bad-to"), toDevice: 1 },
            { ...message("bad-kind"), kind: "other" },
            { ...message("bad-expiry"), expiresAt: "now" },
          ],
        },
      }),
    });
    const store = createLocalMessageStore(raw);

    expect(store.load("device-a", 0)).toEqual({});
    expect(store.load("device-b", 0)).toEqual({});
    expect(store.load("device-c", 0)).toEqual({ "peer-3": [message("ok")] });
  });

  it("trims the oldest messages above the limit", () => {
    const store = createLocalMessageStore(storage());
    for (let index = 0; index < MAX_LOCAL_MESSAGES + 2; index += 1) {
      store.append("device-a", "peer-1", message(`m-${index}`, { createdAt: index }));
    }

    const loaded = store.load("device-a", 0)["peer-1"]!;
    expect(loaded).toHaveLength(MAX_LOCAL_MESSAGES);
    expect(loaded[0]?.id).toBe("m-2");
    expect(loaded.at(-1)?.id).toBe(`m-${MAX_LOCAL_MESSAGES + 1}`);
  });

  it("clears all local-message keys without touching other storage", () => {
    const raw = storage({ unrelated: "keep" });
    const store = createLocalMessageStore(raw);
    store.append("device-a", "peer-1", message("m1"));
    store.append("device-b", "peer-1", message("m2"));

    store.clearAll();

    expect(store.load("device-a", 0)).toEqual({});
    expect(store.load("device-b", 0)).toEqual({});
    expect(raw.getItem("unrelated")).toBe("keep");
  });

  it("removes a single local message from persistence", () => {
    const store = createLocalMessageStore(storage());
    store.append("device-a", "peer-1", message("m1"));
    store.append("device-a", "peer-1", message("m2"));

    store.remove("device-a", "missing");
    store.remove("device-a", "m1");
    expect(store.load("device-a", 0)).toEqual({ "peer-1": [message("m2")] });
    store.remove("device-a", "m2");
    expect(store.load("device-a", 0)).toEqual({});
  });

  it("survives storage reads that throw", () => {
    const raw = storage();
    const store = createLocalMessageStore({
      ...raw,
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(store.load("device-a", 0)).toEqual({});
    expect(() => store.append("device-a", "peer-1", message("m1"))).not.toThrow();
    expect(() => store.clearAll()).not.toThrow();
  });

  it("does not throw when storage rejects writes and clears by device", () => {
    const raw = storage();
    const setItem = vi.fn(() => {
      throw new Error("quota");
    });
    const store = createLocalMessageStore({ ...raw, setItem });

    expect(() => store.append("device-a", "peer-1", message("m1"))).not.toThrow();

    const ok = createLocalMessageStore(storage());
    ok.append("device-a", "peer-1", message("m1"));
    ok.clear("device-a");
    expect(ok.load("device-a", 0)).toEqual({});
  });
});
