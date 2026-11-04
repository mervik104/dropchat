import type { ChatMessage } from "@dropchat/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeleteMessageDialog } from "./DeleteMessageDialog";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    chatKey: "a:b",
    fromDevice: "a",
    toDevice: "b",
    kind: "text",
    text: "Удалить меня",
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

describe("DeleteMessageDialog", () => {
  it("warns that a cloud file will be deleted too", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => undefined);
    render(
      <DeleteMessageDialog
        message={message({
          kind: "file",
          text: null,
          fileId: "file-1",
          fileName: "report.pdf",
          transport: "cloud",
        })}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByText(
        "Сообщение и файл в облаке будут удалены у всех участников.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Удалить у всех" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and shows an error when deletion fails", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => {
      throw new Error("failed");
    });
    render(
      <DeleteMessageDialog
        message={message()}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Удалить у всех" }));

    expect(
      await screen.findByText("Не удалось удалить сообщение"),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Удалить у всех" }),
    ).not.toHaveProperty("disabled", true);
  });
});
