import type { PeersResponse } from "@dropchat/shared";

import { ApiError, createApiClient } from "./api";
import {
  ensureIdentity,
  type DeviceIdentity,
  type IdentityStore,
  type RandomSource,
} from "./identity";

export class IdentityRejectedError extends Error {
  constructor() {
    super("identity_rejected");
    this.name = "IdentityRejectedError";
  }
}

export class RegistrationRateLimitedError extends Error {
  constructor() {
    super("registration_rate_limited");
    this.name = "RegistrationRateLimitedError";
  }
}

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
  const stored = await dependencies.store.load();
  const identity =
    stored ??
    (await ensureIdentity(
      dependencies.store,
      dependencies.random,
      dependencies.name,
      dependencies.platform,
    ));
  const api = createApiClient(
    dependencies.fetchImpl,
    dependencies.apiUrl,
    identity,
  );

  let peers: PeersResponse;
  try {
    peers = await api.getPeers();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    let registration: "created" | "exists";
    try {
      registration = await api.register();
    } catch (registrationError) {
      if (
        registrationError instanceof ApiError &&
        registrationError.status === 429
      ) {
        throw new RegistrationRateLimitedError();
      }
      throw registrationError;
    }

    if (registration === "exists") {
      throw new IdentityRejectedError();
    }

    try {
      peers = await api.getPeers();
    } catch (readError) {
      if (readError instanceof ApiError && readError.status === 401) {
        throw new IdentityRejectedError();
      }
      throw readError;
    }
  }

  return { identity, peers };
}
