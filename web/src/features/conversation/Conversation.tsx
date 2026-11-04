import { useRef, useState, type DragEvent } from "react";

import type { ChatMessage, PeerSummary } from "@dropchat/shared";

import type { UploadState } from "../../app/types";
import { UploadIcon } from "../../ui/icons";
import { Composer } from "./Composer";
import { DeleteMessageDialog } from "./DeleteMessageDialog";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageList";
import { UploadStrip } from "./UploadStrip";

export interface ConversationProps {
  currentDeviceId: string;
  peer: PeerSummary;
  messages: ChatMessage[];
  nextBefore: string | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onLoadMore: (before: string) => void;
  onSend: (text: string) => Promise<void>;
  onRetry: (message: ChatMessage) => Promise<void>;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onUnlink: () => Promise<void>;
  uploads: UploadState[];
  onAttach: (files: File[]) => void;
  onCancelUpload: (id: string) => void;
  onDownload: (fileId: string) => Promise<void>;
  onDelete: (message: ChatMessage) => Promise<void>;
  now: () => number;
}

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function Conversation({
  currentDeviceId,
  peer,
  messages,
  nextBefore,
  loading,
  error,
  onBack,
  onLoadMore,
  onSend,
  onRetry,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onUnlink,
  uploads,
  onAttach,
  onCancelUpload,
  onDownload,
  onDelete,
  now,
}: ConversationProps) {
  const [dragging, setDragging] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<ChatMessage | null>(
    null,
  );
  const dragDepthRef = useRef(0);

  function handleDragEnter(event: DragEvent<HTMLDivElement>): void {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(): void {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      onAttach(files);
    }
  }

  return (
    <div
      data-testid="conversation-dropzone"
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ConversationHeader
        peer={peer}
        menuOpen={menuOpen}
        onBack={onBack}
        onToggleMenu={onToggleMenu}
        onCloseMenu={onCloseMenu}
        onUnlink={onUnlink}
      />

      <MessageList
        currentDeviceId={currentDeviceId}
        messages={messages}
        nextBefore={nextBefore}
        loading={loading}
        error={error}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
        onDownload={onDownload}
        onDelete={setDeleteCandidate}
        now={now}
      />

      {uploads.length > 0 ? (
        <UploadStrip uploads={uploads} onCancelUpload={onCancelUpload} />
      ) : null}

      <Composer onSend={onSend} onAttach={onAttach} />

      {deleteCandidate ? (
        <DeleteMessageDialog
          message={deleteCandidate}
          onClose={() => setDeleteCandidate(null)}
          onConfirm={() => onDelete(deleteCandidate)}
        />
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-40 flex animate-dialog-in flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-accent bg-surface/95 text-center shadow-pop backdrop-blur-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent animate-pulse">
            <UploadIcon size={24} />
          </span>
          <p className="text-sm font-semibold text-fg">Отпустите, чтобы отправить</p>
          <p className="text-xs text-muted">Файлы уйдут этому устройству</p>
        </div>
      ) : null}
    </div>
  );
}
