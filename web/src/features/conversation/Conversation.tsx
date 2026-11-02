import type { ChatMessage, PeerSummary } from "@dropchat/shared";

import type { UploadState } from "../../app/types";
import type { TransferMode } from "../../lib/transfer-mode";
import { Composer } from "./Composer";
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
  mode: TransferMode;
  onModeChange: (mode: TransferMode) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onUnlink: () => Promise<void>;
  onBlock: () => Promise<void>;
  upload: UploadState | null;
  onAttach: (file: File) => void;
  onCancelUpload: () => void;
  onDownload: (fileId: string) => Promise<void>;
  now: () => number;
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
  mode,
  onModeChange,
  menuOpen,
  onToggleMenu,
  onUnlink,
  onBlock,
  upload,
  onAttach,
  onCancelUpload,
  onDownload,
  now,
}: ConversationProps) {
  return (
    <>
      <ConversationHeader
        peer={peer}
        mode={mode}
        onModeChange={onModeChange}
        menuOpen={menuOpen}
        onBack={onBack}
        onToggleMenu={onToggleMenu}
        onUnlink={onUnlink}
        onBlock={onBlock}
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
        now={now}
      />

      {upload ? (
        <UploadStrip upload={upload} onCancelUpload={onCancelUpload} />
      ) : null}

      <Composer onSend={onSend} onAttach={onAttach} />
    </>
  );
}
