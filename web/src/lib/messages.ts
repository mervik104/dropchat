import { buildChatKey, type ChatMessage } from "@dropchat/shared";

import type { DeviceIdentity } from "./identity";

export const LOCAL_MESSAGE_TTL_MS = 30 * 86_400_000;

export function createOptimisticText(input: {
  identity: DeviceIdentity;
  peerId: string;
  text: string;
  id: string;
  now: number;
}): ChatMessage {
  return {
    id: input.id,
    chatKey: buildChatKey(input.identity.deviceId, input.peerId),
    fromDevice: input.identity.deviceId,
    toDevice: input.peerId,
    kind: "text",
    text: input.text,
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: null,
    status: "sending",
    createdAt: input.now,
    expiresAt: 0,
  };
}

export function createIncomingText(input: {
  identity: DeviceIdentity;
  peerId: string;
  text: string;
  id: string;
  now: number;
}): ChatMessage {
  return {
    id: input.id,
    chatKey: buildChatKey(input.identity.deviceId, input.peerId),
    fromDevice: input.peerId,
    toDevice: input.identity.deviceId,
    kind: "text",
    text: input.text,
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: "p2p",
    status: "sent",
    createdAt: input.now,
    expiresAt: input.now + LOCAL_MESSAGE_TTL_MS,
  };
}

export function createOutgoingLocalText(input: {
  identity: DeviceIdentity;
  peerId: string;
  text: string;
  id: string;
  now: number;
}): ChatMessage {
  return {
    id: input.id,
    chatKey: buildChatKey(input.identity.deviceId, input.peerId),
    fromDevice: input.identity.deviceId,
    toDevice: input.peerId,
    kind: "text",
    text: input.text,
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: "p2p",
    status: "sent",
    createdAt: input.now,
    expiresAt: input.now + LOCAL_MESSAGE_TTL_MS,
  };
}

export function createLocalFileMessage(input: {
  identity: DeviceIdentity;
  peerId: string;
  meta: { name: string; size: number; mime: string };
  direction: "in" | "out";
  id: string;
  now: number;
}): ChatMessage {
  const own = input.direction === "out";
  return {
    id: input.id,
    chatKey: buildChatKey(input.identity.deviceId, input.peerId),
    fromDevice: own ? input.identity.deviceId : input.peerId,
    toDevice: own ? input.peerId : input.identity.deviceId,
    kind: "file",
    text: null,
    fileId: null,
    fileName: input.meta.name,
    fileSize: input.meta.size,
    mime: input.meta.mime,
    transport: "p2p",
    status: "sent",
    createdAt: input.now,
    expiresAt: input.now + LOCAL_MESSAGE_TTL_MS,
  };
}

export function upsertMessage(
  messages: ChatMessage[],
  message: ChatMessage,
): ChatMessage[] {
  return sortMessages([
    ...messages.filter((candidate) => candidate.id !== message.id),
    message,
  ]);
}

export function replaceMessage(
  messages: ChatMessage[],
  optimisticId: string,
  message: ChatMessage,
): ChatMessage[] {
  return upsertMessage(
    messages.filter((candidate) => candidate.id !== optimisticId),
    message,
  );
}

export function mergeIncomingMessage(
  current: ChatMessage[],
  incoming: ChatMessage,
): { messages: ChatMessage[]; removedIds: string[] } {
  const removedIds: string[] = [];
  const filtered =
    incoming.kind === "file"
      ? current.filter((message) => {
          const duplicate =
            message.id !== incoming.id &&
            message.kind === "file" &&
            message.fromDevice === incoming.fromDevice &&
            message.toDevice === incoming.toDevice &&
            message.fileName === incoming.fileName &&
            message.fileSize === incoming.fileSize &&
            message.transport !== incoming.transport &&
            Math.abs(message.createdAt - incoming.createdAt) < 300_000;
          if (duplicate) {
            removedIds.push(message.id);
          }
          return !duplicate;
        })
      : current;
  return { messages: upsertMessage(filtered, incoming), removedIds };
}

export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return sortMessages([...byId.values()]);
}

export function setMessageStatus(
  messages: ChatMessage[],
  messageId: string,
  status: string,
): ChatMessage[] {
  return messages.map((message) =>
    message.id === messageId ? { ...message, status } : message,
  );
}

export function peerIdForMessage(
  currentDeviceId: string,
  message: ChatMessage,
): string {
  return message.fromDevice === currentDeviceId
    ? message.toDevice
    : message.fromDevice;
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (left, right) =>
      left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}
