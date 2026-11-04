import { useState } from "react";

import type { ChatMessage } from "@dropchat/shared";

import { Button } from "../../ui/Button";
import { Hint } from "../../ui/Hint";
import { WarningIcon } from "../../ui/icons";
import { Modal } from "../../ui/Modal";

export interface DeleteMessageDialogProps {
  message: ChatMessage;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteMessageDialog({
  message,
  onClose,
  onConfirm,
}: DeleteMessageDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);
  const isCloudFile =
    message.kind === "file" && message.transport === "cloud";

  async function handleConfirm(): Promise<void> {
    setDeleting(true);
    setError(false);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError(true);
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Удалить сообщение?"
      description={
        isCloudFile
          ? "Сообщение и файл в облаке будут удалены у всех участников."
          : "Сообщение будет удалено у всех участников."
      }
      size="sm"
      variant="dialog"
      closeLabel="Закрыть"
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={deleting}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={deleting}
            onClick={() => void handleConfirm()}
          >
            Удалить у всех
          </Button>
        </div>
      }
    >
      <p className="break-words rounded-control border border-border bg-canvas px-3 py-2 text-sm text-fg [overflow-wrap:anywhere]">
        {message.kind === "file" ? message.fileName : message.text}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        Это действие нельзя отменить.
      </p>
      {error ? (
        <Hint tone="danger" icon={<WarningIcon />} className="mt-3">
          Не удалось удалить сообщение
        </Hint>
      ) : null}
    </Modal>
  );
}
