import type { PeersResponse } from "@dropchat/shared";

import { createApiClient } from "./api";
import {
  ensureIdentity,
  type DeviceIdentity,
  type IdentityStore,
  type RandomSource,
} from "./identity";

export interface Workspace {
  identity: DeviceIdentity;
  peers: PeersResponse;
}

export interface WorkspaceDependencies {
  store: IdentityStore;
  random: RandomSource;
  fetchImpl: typeof fetch;
  apiUrl: string;
  name: string;
  platform: string;
}

export async function loadWorkspace(
  dependencies: WorkspaceDependencies,
): Promise<Workspace> {
  const identity = await ensureIdentity(
    dependencies.store,
    dependencies.random,
    dependencies.name,
    dependencies.platform,
  );
  const api = createApiClient(
    dependencies.fetchImpl,
    dependencies.apiUrl,
    identity,
  );

  let peers: PeersResponse;
  try {
    peers = await api.getPeers();
  } catch {
    await api.register();
    peers = await api.getPeers();
  }

  return { identity, peers };
}
