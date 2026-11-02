import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Conversation } from "./Conversation";

const peer = {
  id: "peer-1",
  name: "Phone",
  platform: "android",
  online: true,
  lastSeen: 1,
};

function renderConversation() {
  const onAttach = vi.fn();
  const { unmount } = render(
    <Conversation
      currentDeviceId="device-a"
      peer={peer}
      messages={[]}
      nextBefore={null}
      loading={false}
      error={false}
      onBack={vi.fn()}
      onLoadMore={vi.fn()}
      onSend={vi.fn(async () => undefined)}
      onRetry={vi.fn(async () => undefined)}
      menuOpen={false}
      onToggleMenu={vi.fn()}
      onCloseMenu={vi.fn()}
      onUnlink={vi.fn(async () => undefined)}
      uploads={[]}
      onAttach={onAttach}
      onCancelUpload={vi.fn()}
      onDownload={vi.fn(async () => undefined)}
      now={() => 1_000}
    />,
  );
  return { onAttach, unmount };
}

function dragData(files: File[] = [], types: string[] = ["Files"]) {
  return { dataTransfer: { files, types, dropEffect: "" } };
}

describe("Conversation file drop zone", () => {
  it("shows the overlay for file drags and ignores other drags", () => {
    renderConversation();
    const zone = screen.getByTestId("conversation-dropzone");

    fireEvent.dragEnter(zone, dragData([], ["text/plain"]));
    expect(screen.queryByText("Отпустите, чтобы отправить")).toBeNull();
    fireEvent.dragEnter(zone);
    expect(screen.queryByText("Отпустите, чтобы отправить")).toBeNull();
    fireEvent.dragOver(zone, dragData([], ["text/plain"]));
    expect(screen.queryByText("Отпустите, чтобы отправить")).toBeNull();

    fireEvent.dragEnter(zone, dragData());
    fireEvent.dragEnter(zone, dragData());
    expect(screen.getByText("Отпустите, чтобы отправить")).toBeTruthy();
    expect(screen.getByText("Файлы уйдут этому устройству")).toBeTruthy();

    fireEvent.dragLeave(zone);
    expect(screen.getByText("Отпустите, чтобы отправить")).toBeTruthy();
    fireEvent.dragLeave(zone);
    expect(screen.queryByText("Отпустите, чтобы отправить")).toBeNull();
  });

  it("attaches dropped files and ignores empty drops", () => {
    const { onAttach } = renderConversation();
    const zone = screen.getByTestId("conversation-dropzone");
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });

    fireEvent.dragEnter(zone, dragData());
    fireEvent.dragOver(zone, dragData());
    fireEvent.drop(zone, dragData([file]));
    expect(onAttach).toHaveBeenCalledWith([file]);
    expect(screen.queryByText("Отпустите, чтобы отправить")).toBeNull();

    fireEvent.drop(zone, dragData([]));
    fireEvent.drop(zone);
    expect(onAttach).toHaveBeenCalledTimes(1);
  });
});
