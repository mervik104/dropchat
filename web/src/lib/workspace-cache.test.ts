import type { PeersResponse } from "@dropchat/shared";
import { describe, expect, it, vi } from "vitest";

import type { Workspace } from "./workspace";
import {
  createWorkspaceCache,
  WORKSPACE_CACHE_PREFIX,
} from "./workspace-cache";

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

const peers: PeersResponse = {
  local: [
    {
      id: "peer-1",
      name: "Phone",
      platform: "web",
      online: true,
      lastSeen: 1,
    },
  ],
  linked: [],
  incomingRequests: [],
};

const workspace: Workspace = {
  identity: {
    deviceId: "device-a",
    secret: "s".repeat(43),
    name: "Mac",
    platform: "web",
  },
  peers,
};

describe("workspace cache", () => {
  it("saves and loads peers per device", () => {
    const raw = storage();
    const cache = createWorkspaceCache(raw);

    cache.save(workspace);
    expect(cache.load("device-a")).toEqual(peers);
    expect(cache.load("device-b")).toBeNull();
  });

  it("rejects corrupted or invalid cache entries", () => {
    const cache = createWorkspaceCache(
      storage({
        [`${WORKSPACE_CACHE_PREFIX}a`]: "bad json",
        [`${WORKSPACE_CACHE_PREFIX}b`]: JSON.stringify({ version: 2, peers }),
        [`${WORKSPACE_CACHE_PREFIX}c`]: JSON.stringify({
          version: 1,
          peers: { local: [{}], linked: [], incomingRequests: [] },
        }),
        [`${WORKSPACE_CACHE_PREFIX}d`]: JSON.stringify({
          version: 1,
          peers: { local: [], linked: [], incomingRequests: [] },
        }),
        [`${WORKSPACE_CACHE_PREFIX}e`]: JSON.stringify({
          version: 1,
          peers: null,
        }),
        [`${WORKSPACE_CACHE_PREFIX}f`]: JSON.stringify({
          version: 1,
          peers: "bad",
        }),
        [`${WORKSPACE_CACHE_PREFIX}g`]: JSON.stringify({
          version: 1,
          peers: { local: [null], linked: [], incomingRequests: [] },
        }),
      }),
    );

    expect(cache.load("a")).toBeNull();
    expect(cache.load("b")).toBeNull();
    expect(cache.load("c")).toBeNull();
    expect(cache.load("d")).toEqual({
      local: [],
      linked: [],
      incomingRequests: [],
    });
    expect(cache.load("e")).toBeNull();
    expect(cache.load("f")).toBeNull();
    expect(cache.load("g")).toBeNull();
  });

  it("clears all workspace cache keys and survives blocked reads", () => {
    const raw = storage({ unrelated: "keep" });
    const cache = createWorkspaceCache(raw);
    cache.save(workspace);
    cache.clearAll();
    expect(cache.load("device-a")).toBeNull();
    expect(raw.getItem("unrelated")).toBe("keep");

    const blocked = createWorkspaceCache({
      ...raw,
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(blocked.load("device-a")).toBeNull();
    expect(() => blocked.clearAll()).not.toThrow();
  });

  it("ignores storage write failures and clears entries", () => {
    const raw = storage();
    const cache = createWorkspaceCache({
      ...raw,
      setItem: vi.fn(() => {
        throw new Error("quota");
      }),
    });
    expect(() => cache.save(workspace)).not.toThrow();

    const ok = createWorkspaceCache(raw);
    ok.save(workspace);
    ok.clear("device-a");
    expect(ok.load("device-a")).toBeNull();
  });
});
