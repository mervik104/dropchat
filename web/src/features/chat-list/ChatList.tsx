import type { ChatMessage, PeerSummary } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { EmptyState } from "../../ui/EmptyState";
import { ChatIcon } from "../../ui/icons";
import { ChatListItem } from "./ChatListItem";

export interface ChatListProps {
  peers: PeerSummary[];
  messagesByPeer: Record<string, ChatMessage[]>;
  currentDeviceId: string;
  modeFor: (peerId: string) => TransferMode;
  onSelectPeer: (peerId: string) => void;
}

export function ChatList({
  peers,
  messagesByPeer,
  currentDeviceId,
  modeFor,
  onSelectPeer,
}: ChatListProps) {
  return (
    <section aria-labelledby="chats-heading" className="mt-6">
      <div className="flex items-center justify-between px-1">
        <h2
          id="chats-heading"
          className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Чаты
        </h2>
        <span className="text-2xs font-medium tabular-nums text-muted">
          {peers.length}
        </span>
      </div>

      {peers.length === 0 ? (
        <EmptyState
          compact
          className="mt-2 rounded-card border border-dashed border-border bg-surface/60"
          icon={<ChatIcon />}
          title="Пока нет чатов"
          description="Добавьте устройство по коду приглашения или из раздела «Рядом»."
        />
      ) : (
        <ul className="mt-2 space-y-0.5">
          {peers.map((peer) => {
            const messages = messagesByPeer[peer.id] ?? [];
            return (
              <ChatListItem
                key={peer.id}
                peer={peer}
                mode={modeFor(peer.id)}
                currentDeviceId={currentDeviceId}
                lastMessage={messages[messages.length - 1]}
                onSelect={onSelectPeer}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
