import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createModeStore,
  transferWithMode,
  type TransferMode,
  type TransferStatus,
} from "./transfer-mode";

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

afterEach(() => {
  vi.useRealTimers();
});

describe("createModeStore", () => {
  it("stores a mode per peer", () => {
    const store = createModeStore(storage());

    expect(store.get("peer-1")).toBe("auto");
    store.set("peer-1", "local");
    store.set("peer-2", "cloud");

    expect(store.get("peer-1")).toBe("local");
    expect(store.get("peer-2")).toBe("cloud");
  });

  it("falls back for invalid stored values", () => {
    const raw = storage({ "dropchat.transfer-mode.v1:peer-1": "bad" });
    expect(createModeStore(raw).get("peer-1")).toBe("auto");
  });
});

describe("transferWithMode", () => {
  it.each<TransferMode>(["local", "cloud"])(
    "uses the selected %s transport",
    async (mode) => {
      const statuses: TransferStatus[] = [];
      const startP2P = vi.fn(async () => "p2p");
      const startCloud = vi.fn(async () => "cloud");

      await expect(
        transferWithMode(mode, {
          startP2P,
          startCloud,
          onStatus: (status) => statuses.push(status),
        }),
      ).resolves.toBe(mode === "local" ? "p2p" : "cloud");
      expect(statuses.at(-1)).toBe(mode);
    },
  );

  it("uses P2P in auto mode when it connects", async () => {
    const statuses: TransferStatus[] = [];
    await expect(
      transferWithMode("auto", {
        startP2P: async () => "p2p",
        startCloud: async () => "cloud",
        onStatus: (status) => statuses.push(status),
      }),
    ).resolves.toBe("p2p");
    expect(statuses).toContain("connecting");
    expect(statuses.at(-1)).toBe("local");
  });

  it("falls back to cloud after eight seconds in auto mode", async () => {
    vi.useFakeTimers();
    const statuses: TransferStatus[] = [];
    const controller = new AbortController();
    let p2pSignal: AbortSignal | undefined;
    const startP2P = vi.fn((signal: AbortSignal) => {
      p2pSignal = signal;
      return new Promise<string>(() => undefined);
    });
    const startCloud = vi.fn(async () => "cloud");

    const promise = transferWithMode("auto", {
      startP2P,
      startCloud,
      onStatus: (status) => statuses.push(status),
      signal: controller.signal,
    });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(startCloud).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toBe("cloud");
    expect(startCloud).toHaveBeenCalledTimes(1);
    expect(statuses).toContain("fallback");
    expect(p2pSignal?.aborted).toBe(true);
  });

  it("falls back to cloud when P2P fails early in auto mode", async () => {
    const statuses: TransferStatus[] = [];
    await expect(
      transferWithMode("auto", {
        startP2P: async () => {
          throw new Error("rtc failed");
        },
        startCloud: async () => "cloud",
        onStatus: (status) => statuses.push(status),
      }),
    ).resolves.toBe("cloud");
    expect(statuses).toContain("fallback");
  });

  it("surfaces local P2P errors", async () => {
    await expect(
      transferWithMode("local", {
        startP2P: async () => {
          throw new Error("rtc failed");
        },
        startCloud: async () => "cloud",
        onStatus: vi.fn(),
      }),
    ).rejects.toThrow("rtc failed");
  });

  it("does not fall back after cancellation", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const startCloud = vi.fn(async () => "cloud");
    const promise = transferWithMode("auto", {
      startP2P: (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
      startCloud,
      onStatus: vi.fn(),
      signal: controller.signal,
    });
    controller.abort();
    const assertion = expect(promise).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
    expect(startCloud).not.toHaveBeenCalled();
  });
});
