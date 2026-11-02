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
  incomingRequests: PeerSummary[];
}

export interface UpdateDeviceRequest {
  name?: string;
  invisible?: boolean;
}

export type MessageKind = "text" | "file";
export type MessageTransport = "cloud" | "p2p";

export interface ChatMessage {
  id: string;
  chatKey: string;
  fromDevice: string;
  toDevice: string;
  kind: MessageKind;
  text: string | null;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  mime: string | null;
  transport: MessageTransport | null;
  status: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface MessagesPage {
  messages: ChatMessage[];
  nextBefore: string | null;
}

export interface WsTicketResponse {
  ticket: string;
  expiresAt: number;
}

export type WsEvent =
  | { type: "message.new"; message: ChatMessage }
  | { type: "presence"; deviceId: string; online: boolean }
  | { type: "peer.request"; from: PeerSummary }
  | { type: "peer.linked"; peer: PeerSummary };

export interface InviteResponse {
  code: string;
  expiresAt: number;
}

export interface RedeemInviteResponse {
  peer: PeerSummary;
}
