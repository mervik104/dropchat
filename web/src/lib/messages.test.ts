import type { ChatMessage } from "@dropchat/shared";
import { describe, expect, it } from "vitest";

import type { DeviceIdentity } from "./identity";
import {
  createIncomingText,
  createLocalFileMessage,
  createOptimisticText,
  createOutgoingLocalText,
  LOCAL_MESSAGE_TTL_MS,
  mergeIncomingMessage,
  mergeMessages,
  mergeMessagesWithLocalPriority,
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

  it("keeps local messages authoritative when merging server history", () => {
    const local = message({ id: "msg-1", text: "local", transport: "p2p" });
    const server = message({ id: "msg-1", text: "server", transport: null });
    const extra = message({ id: "msg-2", createdAt: 2 });

    expect(mergeMessagesWithLocalPriority([local], [server, extra])).toEqual([
      local,
      extra,
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

  it("creates incoming text and local file messages", () => {
    expect(
      createIncomingText({
        identity,
        peerId: "device-b",
        text: "hi",
        id: "in-1",
        now: 5,
      }),
    ).toMatchObject({
      id: "in-1",
      fromDevice: "device-b",
      toDevice: "device-a",
      text: "hi",
      status: "sent",
      createdAt: 5,
      expiresAt: 5 + LOCAL_MESSAGE_TTL_MS,
    });

    const meta = { name: "a.txt", size: 3, mime: "text/plain" };
    expect(
      createLocalFileMessage({
        identity,
        peerId: "device-b",
        meta,
        direction: "out",
        id: "file-out",
        now: 6,
      }),
    ).toMatchObject({
      fromDevice: "device-a",
      toDevice: "device-b",
      kind: "file",
      fileName: "a.txt",
      fileSize: 3,
      transport: "p2p",
      status: "sent",
      createdAt: 6,
      expiresAt: 6 + LOCAL_MESSAGE_TTL_MS,
    });
    expect(
      createLocalFileMessage({
        identity,
        peerId: "device-b",
        meta,
        direction: "in",
        id: "file-in",
        now: 7,
      }),
    ).toMatchObject({
      fromDevice: "device-b",
      toDevice: "device-a",
      transport: "p2p",
    });
    expect(
      createOutgoingLocalText({
        identity,
        peerId: "device-b",
        text: "p2p",
        id: "out-1",
        now: 8,
      }),
    ).toMatchObject({
      fromDevice: "device-a",
      toDevice: "device-b",
      transport: "p2p",
      status: "sent",
      expiresAt: 8 + LOCAL_MESSAGE_TTL_MS,
    });
  });

  it("deduplicates a local P2P file when its cloud counterpart arrives", () => {
    const local = message({
      id: "local-file",
      kind: "file",
      text: null,
      fileName: "a.txt",
      fileSize: 3,
      transport: "p2p",
      createdAt: 100,
    });
    const cloud = message({
      id: "cloud-file",
      kind: "file",
      text: null,
      fileName: "a.txt",
      fileSize: 3,
      transport: "cloud",
      createdAt: 200,
    });

    expect(mergeIncomingMessage([local], cloud)).toEqual({
      messages: [cloud],
      removedIds: ["local-file"],
    });
    expect(mergeIncomingMessage([local], { ...cloud, fileName: "b.txt" })).toEqual({
      messages: [local, { ...cloud, fileName: "b.txt" }],
      removedIds: [],
    });
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
