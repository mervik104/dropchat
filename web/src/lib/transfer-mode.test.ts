import { afterEach, describe, expect, it, vi } from "vitest";

import {
  transferWithMode,
  type TransferMode,
  type TransferStatus,
} from "./transfer-mode";

afterEach(() => {
  vi.useRealTimers();
});

describe("transferWithMode", () => {
  it.each<TransferMode>(["local", "cloud"])(
    "uses the selected %s transport",
    async (mode) => {
      const statuses: TransferStatus[] = [];
      const startP2P = vi.fn(
        async (_signal: AbortSignal, onConnected: () => void) => {
          onConnected();
          return "p2p";
        },
      );
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

  it("does not fall back while an already connected P2P transfer runs", async () => {
    vi.useFakeTimers();
    const startCloud = vi.fn(async () => "cloud");
    const promise = transferWithMode("auto", {
      startP2P: async (_signal, onConnected) => {
        onConnected();
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve("p2p"), 20_000);
        });
      },
      startCloud,
      onStatus: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(8_000);
    expect(startCloud).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(promise).resolves.toBe("p2p");
    expect(startCloud).not.toHaveBeenCalled();
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
