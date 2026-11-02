import type {
  ChatMessage,
  DeviceProfile,
  InviteResponse,
  MessagesPage,
  PeerSummary,
  PeersResponse,
  UpdateDeviceRequest,
  WsTicketResponse,
} from "@dropchat/shared";

import type { DeviceIdentity } from "./identity";

export class ApiError extends Error {
  constructor(readonly status: number) {
    super("api_request_failed");
    this.name = "ApiError";
  }
}

export interface ApiClient {
  register(): Promise<"created" | "exists">;
  getPeers(): Promise<PeersResponse>;
  updateDevice(patch: UpdateDeviceRequest): Promise<DeviceProfile>;
  createWsTicket(): Promise<WsTicketResponse>;
  getMessages(peerId: string, before?: string): Promise<MessagesPage>;
  sendText(peerId: string, text: string, clientId: string): Promise<ChatMessage>;
  requestPeer(peerId: string): Promise<PeerSummary>;
  respondPeer(
    fromDeviceId: string,
    accept: boolean,
  ): Promise<{ linked: boolean; peer?: PeerSummary }>;
  createInvite(): Promise<InviteResponse>;
  redeemInvite(code: string): Promise<PeerSummary>;
}

export function createApiClient(
  fetchImpl: typeof fetch,
  apiUrl: string,
  identity: DeviceIdentity,
): ApiClient {
  const authorization = `Bearer ${identity.deviceId}.${identity.secret}`;

  return {
    async register(): Promise<"created" | "exists"> {
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

      if (response.status === 201) {
        return "created";
      }
      if (response.status === 409) {
        return "exists";
      }
      throw new ApiError(response.status);
    },

    async getPeers(): Promise<PeersResponse> {
      const response = await fetchImpl(`${apiUrl}/api/peers`, {
        headers: { Authorization: authorization },
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return (await response.json()) as PeersResponse;
    },

    async updateDevice(patch: UpdateDeviceRequest): Promise<DeviceProfile> {
      const response = await fetchImpl(`${apiUrl}/api/devices/me`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return (await response.json()) as DeviceProfile;
    },

    async createWsTicket(): Promise<WsTicketResponse> {
      const response = await fetchImpl(`${apiUrl}/api/ws-ticket`, {
        method: "POST",
        headers: { Authorization: authorization },
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return (await response.json()) as WsTicketResponse;
    },

    async getMessages(peerId: string, before?: string): Promise<MessagesPage> {
      const query = new URLSearchParams({ limit: "50" });
      if (before !== undefined) {
        query.set("before", before);
      }

      const response = await fetchImpl(
        `${apiUrl}/api/chats/${encodeURIComponent(peerId)}/messages?${query}`,
        { headers: { Authorization: authorization } },
      );

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return (await response.json()) as MessagesPage;
    },

    async sendText(
      peerId: string,
      text: string,
      clientId: string,
    ): Promise<ChatMessage> {
      const response = await fetchImpl(
        `${apiUrl}/api/chats/${encodeURIComponent(peerId)}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: authorization,
          },
          body: JSON.stringify({ kind: "text", text, clientId }),
        },
      );

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      const body = (await response.json()) as { message: ChatMessage };
      return body.message;
    },

    async requestPeer(peerId: string): Promise<PeerSummary> {
      const response = await fetchImpl(`${apiUrl}/api/peers/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ toDeviceId: peerId }),
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      const body = (await response.json()) as { request: PeerSummary };
      return body.request;
    },

    async respondPeer(
      fromDeviceId: string,
      accept: boolean,
    ): Promise<{ linked: boolean; peer?: PeerSummary }> {
      const response = await fetchImpl(`${apiUrl}/api/peers/respond`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ fromDeviceId, accept }),
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return (await response.json()) as {
        linked: boolean;
        peer?: PeerSummary;
      };
    },

    async createInvite(): Promise<InviteResponse> {
      const response = await fetchImpl(`${apiUrl}/api/invites`, {
        method: "POST",
        headers: { Authorization: authorization },
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      return (await response.json()) as InviteResponse;
    },

    async redeemInvite(code: string): Promise<PeerSummary> {
      const response = await fetchImpl(`${apiUrl}/api/invites/redeem`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: authorization,
        },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        throw new ApiError(response.status);
      }

      const body = (await response.json()) as { peer: PeerSummary };
      return body.peer;
    },
  };
}
