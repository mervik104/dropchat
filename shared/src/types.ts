export type RuntimeName = "worker" | "drive-gateway";

export interface HelloResponse {
  app: string;
  protocol: number;
  runtime: RuntimeName;
}

export interface ErrorResponse {
  error: string;
}

export interface RegisterDeviceRequest {
  deviceId: string;
  secret: string;
  name?: string;
  platform?: string;
}

export interface DeviceProfile {
  id: string;
  name: string;
  platform: string;
  invisible: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface PeerSummary {
  id: string;
  name: string;
  platform: string;
  online: boolean;
  lastSeen: number;
}

export interface PeersResponse {
  local: PeerSummary[];
  linked: PeerSummary[];
}
