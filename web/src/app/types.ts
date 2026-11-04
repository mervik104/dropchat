import type {
  ChatMessage,
  DeviceProfile,
  InviteResponse,
  MessagesPage,
  PeerSummary,
  PeersResponse,
  RtcSignal,
  UpdateDeviceRequest,
  WsEvent,
} from "@dropchat/shared";

import type { DeviceIdentity } from "../lib/identity";
import type { LocalMessageStore } from "../lib/local-messages";
import type { P2PFileMeta } from "../lib/p2p";
import type { P2PManager } from "../lib/p2p-manager";
import type { RealtimeConnection, SocketState } from "../lib/socket";
import type { TransferStatus } from "../lib/transfer-mode";
import type { Workspace } from "../lib/workspace";

export type ErrorKind = "identity" | "rate_limit" | "generic";
export type ConnectionState = "online" | "connecting" | "local" | "error";

export type LoadState =
  | { status: "loading" }
  | { status: "error"; kind: ErrorKind }
  | { status: "ready"; workspace: Workspace };

export interface UploadState {
  id: string;
  peerId: string;
  name: string;
  percent: number;
  error: boolean;
  status: TransferStatus;
}

export interface AppProps {
  loadWorkspace: () => Promise<Workspace>;
  loadCachedWorkspace: () => Promise<Workspace | null>;
  saveProfile: (
    identity: DeviceIdentity,
    patch: UpdateDeviceRequest,
  ) => Promise<DeviceProfile>;
  resetIdentity: () => Promise<void>;
  importIdentity: (text: string) => Promise<void>;
  loadMessages: (
    identity: DeviceIdentity,
    peerId: string,
    before?: string,
  ) => Promise<MessagesPage>;
  sendText: (
    identity: DeviceIdentity,
    peerId: string,
    text: string,
    clientId: string,
  ) => Promise<ChatMessage>;
  deleteMessage: (
    identity: DeviceIdentity,
    peerId: string,
    messageId: string,
  ) => Promise<void>;
  connectRealtime: (
    identity: DeviceIdentity,
    onEvent: (event: WsEvent) => void,
    onReconnect: () => void,
    onUnavailable: () => void,
    onStateChange?: (state: SocketState) => void,
  ) => Promise<RealtimeConnection>;
  refreshPeers: (
    identity: DeviceIdentity,
    signal?: AbortSignal,
  ) => Promise<PeersResponse>;
  requestPeer: (identity: DeviceIdentity, peerId: string) => Promise<PeerSummary>;
  respondPeer: (
    identity: DeviceIdentity,
    fromDeviceId: string,
    accept: boolean,
  ) => Promise<{ linked: boolean; peer?: PeerSummary }>;
  createInvite: (identity: DeviceIdentity) => Promise<InviteResponse>;
  redeemInvite: (identity: DeviceIdentity, code: string) => Promise<PeerSummary>;
  unlinkPeer: (identity: DeviceIdentity, peerId: string) => Promise<void>;
  uploadFile: (
    identity: DeviceIdentity,
    file: File,
    peerId: string,
    onProgress: (percent: number) => void,
    signal: AbortSignal,
  ) => Promise<ChatMessage>;
  sendP2PFileMeta: (
    identity: DeviceIdentity,
    peerId: string,
    meta: P2PFileMeta,
  ) => Promise<ChatMessage>;
  createP2PManager: (options: {
    sendSignal: (peerId: string, signal: RtcSignal) => void;
    onFileReceived: (peerId: string, meta: P2PFileMeta) => void;
    onTextReceived: (peerId: string, text: string, id?: string) => void;
    localDeviceId: string;
  }) => P2PManager;
  localMessageStore: LocalMessageStore;
  downloadFile: (
    identity: DeviceIdentity,
    fileId: string,
  ) => Promise<{ url: string }>;
  openUrl: (url: string) => void;
  createLocalId: () => string;
  now: () => number;
  playNotificationSound: () => void;
}
