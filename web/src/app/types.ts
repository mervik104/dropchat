import type {
  ChatMessage,
  DeviceProfile,
  DriveHealthResponse,
  InviteResponse,
  MessagesPage,
  PeerSummary,
  PeersResponse,
  RtcSignal,
  UpdateDeviceRequest,
  WsEvent,
} from "@dropchat/shared";

import type { DeviceIdentity } from "../lib/identity";
import type { P2PFileMeta } from "../lib/p2p";
import type { P2PManager } from "../lib/p2p-manager";
import type { RealtimeConnection } from "../lib/socket";
import type { ModeStore, TransferStatus } from "../lib/transfer-mode";
import type { Workspace } from "../lib/workspace";

export type ErrorKind = "identity" | "rate_limit" | "generic";

export type LoadState =
  | { status: "loading" }
  | { status: "error"; kind: ErrorKind }
  | { status: "ready"; workspace: Workspace };

export interface UploadState {
  peerId: string;
  name: string;
  percent: number;
  error: boolean;
  status: TransferStatus;
}

export interface AppProps {
  loadWorkspace: () => Promise<Workspace>;
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
  connectRealtime: (
    identity: DeviceIdentity,
    onEvent: (event: WsEvent) => void,
    onReconnect: () => void,
  ) => Promise<RealtimeConnection>;
  refreshPeers: (identity: DeviceIdentity) => Promise<PeersResponse>;
  requestPeer: (identity: DeviceIdentity, peerId: string) => Promise<PeerSummary>;
  respondPeer: (
    identity: DeviceIdentity,
    fromDeviceId: string,
    accept: boolean,
  ) => Promise<{ linked: boolean; peer?: PeerSummary }>;
  createInvite: (identity: DeviceIdentity) => Promise<InviteResponse>;
  redeemInvite: (identity: DeviceIdentity, code: string) => Promise<PeerSummary>;
  unlinkPeer: (identity: DeviceIdentity, peerId: string) => Promise<void>;
  blockPeer: (identity: DeviceIdentity, peerId: string) => Promise<void>;
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
    onTextReceived: (peerId: string, text: string) => void;
    localDeviceId: string;
  }) => P2PManager;
  modeStore: ModeStore;
  downloadFile: (
    identity: DeviceIdentity,
    fileId: string,
  ) => Promise<{ url: string }>;
  openUrl: (url: string) => void;
  loadDriveHealth: (identity: DeviceIdentity) => Promise<DriveHealthResponse>;
  createLocalId: () => string;
  now: () => number;
}
