export type TransferMode = "auto" | "local" | "cloud";
export type TransferStatus = "connecting" | "local" | "cloud" | "fallback";

const STORAGE_PREFIX = "dropchat.transfer-mode.v1:";
export const P2P_CONNECT_TIMEOUT_MS = 8_000;

export interface ModeStore {
  get(peerId: string): TransferMode;
  set(peerId: string, mode: TransferMode): void;
}

export function createModeStore(storage: Storage): ModeStore {
  return {
    get(peerId: string): TransferMode {
      const value = storage.getItem(`${STORAGE_PREFIX}${peerId}`);
      return value === "local" || value === "cloud" ? value : "auto";
    },
    set(peerId: string, mode: TransferMode): void {
      storage.setItem(`${STORAGE_PREFIX}${peerId}`, mode);
    },
  };
}

export async function transferWithMode<T>(
  mode: TransferMode,
  options: {
    startP2P: (signal: AbortSignal) => Promise<T>;
    startCloud: () => Promise<T>;
    onStatus: (status: TransferStatus) => void;
    signal?: AbortSignal;
  },
): Promise<T> {
  if (mode === "cloud") {
    options.onStatus("cloud");
    return options.startCloud();
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (mode === "local") {
      options.onStatus("local");
      return await options.startP2P(controller.signal);
    }

    options.onStatus("connecting");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: "timeout" });
      }, P2P_CONNECT_TIMEOUT_MS);
    });

    const outcome = await Promise.race([
      options.startP2P(controller.signal).then(
        (value) => ({ kind: "p2p" as const, value }),
        (error: unknown) => ({ kind: "error" as const, error }),
      ),
      timeout,
    ]);

    clearTimeout(timer);
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (outcome.kind === "p2p") {
      options.onStatus("local");
      return outcome.value;
    }

    options.onStatus("fallback");
    return options.startCloud();
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }
}
