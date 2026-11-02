import { buildChatKey, type ChatMessage } from "@dropchat/shared";

import type { DeviceIdentity } from "./identity";

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
