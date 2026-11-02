import type { PeersResponse } from "@dropchat/shared";

import type { DeviceIdentity } from "./identity";

export class ApiError extends Error {
  constructor() {
    super("api_request_failed");
    this.name = "ApiError";
  }
}

export interface ApiClient {
  register(): Promise<void>;
  getPeers(): Promise<PeersResponse>;
}

export function createApiClient(
  fetchImpl: typeof fetch,
  apiUrl: string,
  identity: DeviceIdentity,
): ApiClient {
  const authorization = `Bearer ${identity.deviceId}.${identity.secret}`;

  return {
    async register(): Promise<void> {
      const response = await fetchImpl(`${apiUrl}/api/devices`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: identity.deviceId,
          secret: identity.secret,
          name: identity.name,
          platform: identity.platform,
        }),
      });

      if (response.status !== 201 && response.status !== 409) {
        throw new ApiError();
      }
    },

    async getPeers(): Promise<PeersResponse> {
      const response = await fetchImpl(`${apiUrl}/api/peers`, {
        headers: { Authorization: authorization },
      });

      if (!response.ok) {
        throw new ApiError();
      }

      return (await response.json()) as PeersResponse;
    },
  };
}
