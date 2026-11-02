import type { PeersResponse } from "@dropchat/shared";

import type { Workspace } from "./workspace";

export const WORKSPACE_CACHE_PREFIX = "dropchat.workspace.v1:";

export interface WorkspaceCache {
  load(deviceId: string): PeersResponse | null;
  save(workspace: Workspace): void;
  clear(deviceId: string): void;
}

export function createWorkspaceCache(storage: Storage): WorkspaceCache {
  return {
    load(deviceId) {
      const raw = storage.getItem(`${WORKSPACE_CACHE_PREFIX}${deviceId}`);
      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as {
          version?: unknown;
          peers?: unknown;
        };
        if (parsed.version !== 1 || !isPeersResponse(parsed.peers)) {
          return null;
        }
        return parsed.peers;
      } catch {
        return null;
      }
    },

    save(workspace) {
      try {
        storage.setItem(
          `${WORKSPACE_CACHE_PREFIX}${workspace.identity.deviceId}`,
          JSON.stringify({ version: 1, peers: workspace.peers }),
        );
      } catch {
        // Cache writes are best-effort; the server remains authoritative.
      }
    },

    clear(deviceId) {
      storage.removeItem(`${WORKSPACE_CACHE_PREFIX}${deviceId}`);
    },
  };
}

function isPeersResponse(value: unknown): value is PeersResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const peers = value as Record<string, unknown>;
  return (
    Array.isArray(peers.local) &&
    Array.isArray(peers.linked) &&
    Array.isArray(peers.incomingRequests) &&
    [...peers.local, ...peers.linked, ...peers.incomingRequests].every(isPeer)
  );
}

function isPeer(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const peer = value as Record<string, unknown>;
  return (
    typeof peer.id === "string" &&
    typeof peer.name === "string" &&
    typeof peer.platform === "string" &&
    typeof peer.online === "boolean" &&
    typeof peer.lastSeen === "number"
  );
}
