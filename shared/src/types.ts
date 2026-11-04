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
  | { type: "peers.snapshot"; peers: PeersResponse }
  | { type: "presence"; deviceId: string; online: boolean }
  | { type: "peer.request"; from: PeerSummary }
  | { type: "peer.linked"; peer: PeerSummary }
  | {
      type: "signal";
      fromDeviceId: string;
      signal: RtcSignal;
    };

export interface InviteResponse {
  code: string;
  expiresAt: number;
}

export interface RedeemInviteResponse {
  peer: PeerSummary;
}

export interface StorageInitResult {
  sessionId: string;
}

export type StoragePartResult =
  | { status: "incomplete"; nextOffset: number }
  | { status: "done"; driveFileId: string };

export interface StorageAdapter {
  init(size: number, mime: string): Promise<StorageInitResult>;
  putPart(
    sessionId: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<StoragePartResult>;
  getStream(driveFileId: string, range?: string): Promise<Response>;
  delete(driveFileId: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
}

export interface DriveHealthResponse {
  ok: boolean;
  quotaUsed: number;
  quotaLimit: number;
}

export type RtcSignal =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | {
      kind: "ice";
      candidate: string;
      sdpMid: string | null;
      sdpMLineIndex: number | null;
    };

export interface ClientSignalMessage {
  type: "signal";
  toDeviceId: string;
  signal: RtcSignal;
}
