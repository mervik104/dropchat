export const APP_NAME = "DropChat";
export const PROTOCOL_VERSION = 1;
export const ONLINE_WINDOW_MS = 60_000;

export function isRtcSignal(value: unknown): value is import("./types").RtcSignal {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const signal = value as Record<string, unknown>;
  if (signal.kind === "offer" || signal.kind === "answer") {
    return typeof signal.sdp === "string" && signal.sdp.length > 0;
  }
  if (signal.kind === "ice") {
    return (
      typeof signal.candidate === "string" &&
      signal.candidate.length > 0 &&
      (signal.sdpMid === null || typeof signal.sdpMid === "string") &&
      (signal.sdpMLineIndex === null ||
        (typeof signal.sdpMLineIndex === "number" &&
          Number.isInteger(signal.sdpMLineIndex)))
    );
  }
  return false;
}

export type {
  ChatMessage,
  ClientSignalMessage,
  ClientTextMessage,
  DeviceProfile,
  DriveHealthResponse,
  ErrorResponse,
  HelloResponse,
  InviteResponse,
  MessageKind,
  MessagesPage,
  MessageTransport,
  PeerSummary,
  PeersResponse,
  RedeemInviteResponse,
  RegisterDeviceRequest,
  RtcSignal,
  RuntimeName,
  StorageAdapter,
  StorageInitResult,
  StoragePartResult,
  UpdateDeviceRequest,
  WsEvent,
  WsTicketResponse,
} from "./types";

export function buildChatKey(deviceA: string, deviceB: string): string {
  return [deviceA, deviceB].sort().join(":");
}

export function isOnline(lastSeen: number, now: number): boolean {
  return now - lastSeen <= ONLINE_WINDOW_MS;
}
