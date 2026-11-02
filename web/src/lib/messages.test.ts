import type { ChatMessage } from "@dropchat/shared";
import { describe, expect, it } from "vitest";

import type { DeviceIdentity } from "./identity";
import {
  createOptimisticText,
  mergeMessages,
  peerIdForMessage,
  replaceMessage,
  setMessageStatus,
  upsertMessage,
} from "./messages";

const identity: DeviceIdentity = {
  deviceId: "device-a",
  secret: "s".repeat(43),
  name: "A",
  platform: "web",
};

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    chatKey: "device-a:device-b",
    fromDevice: "device-b",
    toDevice: "device-a",
    kind: "text",
    text: "one",
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: null,
    status: "sent",
    createdAt: 1,
    expiresAt: 2,
    ...overrides,
  };
}

describe("message state", () => {
  it("creates an optimistic text message", () => {
    const optimistic = createOptimisticText({
      identity,
      peerId: "device-b",
      text: "hello",
      id: "local-1",
      now: 10,
    });

    expect(optimistic).toMatchObject({
      id: "local-1",
      chatKey: "device-a:device-b",
      fromDevice: "device-a",
      toDevice: "device-b",
      text: "hello",
      status: "sending",
      createdAt: 10,
    });
  });

  it("upserts messages, replacing the same id and sorting by time", () => {
    const second = message({ id: "msg-2", createdAt: 2, text: "two" });
    const replacement = message({ id: "msg-1", createdAt: 1, text: "updated" });

    expect(upsertMessage([second], replacement)).toEqual([replacement, second]);
  });

  it("replaces an optimistic message with the server message", () => {
    const optimistic = message({ id: "local-1", status: "sending" });
    const server = message({ id: "msg-9", createdAt: 3 });

    expect(replaceMessage([optimistic], "local-1", server)).toEqual([server]);
  });

  it("merges older pages without duplicates", () => {
    const current = [message({ id: "msg-2", createdAt: 2 })];
    const older = [
      message({ id: "msg-1", createdAt: 1 }),
      message({ id: "msg-2", createdAt: 2, text: "newer" }),
    ];

    expect(mergeMessages(current, older)).toEqual([
      message({ id: "msg-1", createdAt: 1 }),
      message({ id: "msg-2", createdAt: 2, text: "newer" }),
    ]);
  });

  it("marks a message status without changing other messages", () => {
    const other = message({ id: "msg-2", text: "other" });
    const updated = setMessageStatus([message(), other], "msg-1", "failed");

    expect(updated[0]?.status).toBe("failed");
    expect(updated[1]).toBe(other);
  });

  it("breaks timestamp ties by id", () => {
    const first = message({ id: "a", createdAt: 1 });
    const second = message({ id: "b", createdAt: 1 });

    expect(upsertMessage([second], first)).toEqual([first, second]);
  });

  it("finds the peer for incoming messages in both directions", () => {
    expect(peerIdForMessage("device-a", message())).toBe("device-b");
    expect(
      peerIdForMessage(
        "device-a",
        message({ fromDevice: "device-a", toDevice: "device-b" }),
      ),
    ).toBe("device-b");
  });
});
