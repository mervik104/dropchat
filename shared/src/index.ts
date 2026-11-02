export const APP_NAME = "DropChat";
export const PROTOCOL_VERSION = 1;

export type { HelloResponse, RuntimeName } from "./types";

export function buildChatKey(deviceA: string, deviceB: string): string {
  return [deviceA, deviceB].sort().join(":");
}
