import type { ChatMessage } from "@dropchat/shared";

export const LOCAL_MESSAGES_KEY_PREFIX = "dropchat.local-messages.v1:";
export const MAX_LOCAL_MESSAGES = 500;

export interface LocalMessageStore {
  load(deviceId: string, now: number): Record<string, ChatMessage[]>;
  append(deviceId: string, peerId: string, message: ChatMessage): void;
  clear(deviceId: string): void;
}

export function createLocalMessageStore(storage: Storage): LocalMessageStore {
  function read(deviceId: string): Record<string, ChatMessage[]> {
    const raw = storage.getItem(`${LOCAL_MESSAGES_KEY_PREFIX}${deviceId}`);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as {
        version?: unknown;
        peers?: unknown;
      };
      if (
        parsed.version !== 1 ||
        typeof parsed.peers !== "object" ||
        parsed.peers === null ||
        Array.isArray(parsed.peers)
      ) {
        return {};
      }

      const peers: Record<string, ChatMessage[]> = {};
      for (const [peerId, messages] of Object.entries(parsed.peers)) {
        if (!Array.isArray(messages)) {
          continue;
        }
        const valid = messages.filter(isLocalMessage);
        if (valid.length > 0) {
          peers[peerId] = valid;
        }
      }
      return peers;
    } catch {
      return {};
    }
  }

  function write(deviceId: string, peers: Record<string, ChatMessage[]>): void {
    try {
      storage.setItem(
        `${LOCAL_MESSAGES_KEY_PREFIX}${deviceId}`,
        JSON.stringify({ version: 1, peers }),
      );
    } catch {
      // Local persistence is best-effort; quota errors must not break chat.
    }
  }

  return {
    load(deviceId, now) {
      const stored = read(deviceId);
      const result: Record<string, ChatMessage[]> = {};
      for (const [peerId, messages] of Object.entries(stored)) {
        const alive = messages.filter(
          (message) => message.expiresAt === 0 || message.expiresAt > now,
        );
        if (alive.length > 0) {
          result[peerId] = alive;
        }
      }
      return result;
    },

    append(deviceId, peerId, message) {
      const peers = read(deviceId);
      const existing = peers[peerId] ?? [];
      if (existing.some((candidate) => candidate.id === message.id)) {
        return;
      }

      const all = Object.entries({ ...peers, [peerId]: [...existing, message] })
        .flatMap(([id, messages]) =>
          messages.map((candidate) => ({ peerId: id, message: candidate })),
        )
        .sort(
          (left, right) =>
            left.message.createdAt - right.message.createdAt ||
            left.message.id.localeCompare(right.message.id),
        );

      while (all.length > MAX_LOCAL_MESSAGES) {
        all.shift();
      }

      const next: Record<string, ChatMessage[]> = {};
      for (const item of all) {
        (next[item.peerId] ??= []).push(item.message);
      }
      write(deviceId, next);
    },

    clear(deviceId) {
      storage.removeItem(`${LOCAL_MESSAGES_KEY_PREFIX}${deviceId}`);
    },
  };
}

function isLocalMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.fromDevice === "string" &&
    typeof message.toDevice === "string" &&
    (message.kind === "text" || message.kind === "file") &&
    typeof message.createdAt === "number" &&
    typeof message.expiresAt === "number"
  );
}
