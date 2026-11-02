export const APP_NAME = "DropChat";
export const PROTOCOL_VERSION = 1;
export const ONLINE_WINDOW_MS = 60_000;

export type {
  DeviceProfile,
  ErrorResponse,
  HelloResponse,
  PeerSummary,
  PeersResponse,
  RegisterDeviceRequest,
  RuntimeName,
} from "./types";

export function buildChatKey(deviceA: string, deviceB: string): string {
  return [deviceA, deviceB].sort().join(":");
}

export function isOnline(lastSeen: number, now: number): boolean {
  return now - lastSeen <= ONLINE_WINDOW_MS;
}
