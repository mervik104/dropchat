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
  let identity =
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

    let registration;
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

    if (registration.status === "exists") {
      throw new IdentityRejectedError();
    }

    const registeredIdentity = {
      ...identity,
      name: registration.profile.name,
      invisible: registration.profile.invisible,
    };
    if (registeredIdentity.name !== identity.name) {
      identity = registeredIdentity;
      await dependencies.store.save(identity);
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
