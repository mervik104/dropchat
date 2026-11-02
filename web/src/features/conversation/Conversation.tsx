import type { ChatMessage, PeerSummary } from "@dropchat/shared";

import type { UploadState } from "../../app/types";
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
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onUnlink: () => Promise<void>;
  uploads: UploadState[];
  onAttach: (files: File[]) => void;
  onCancelUpload: (id: string) => void;
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
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onUnlink,
  uploads,
  onAttach,
  onCancelUpload,
  onDownload,
  now,
}: ConversationProps) {
  return (
    <>
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
        now={now}
      />

      {uploads.length > 0 ? (
        <UploadStrip uploads={uploads} onCancelUpload={onCancelUpload} />
      ) : null}

      <Composer onSend={onSend} onAttach={onAttach} />
    </>
  );
}
