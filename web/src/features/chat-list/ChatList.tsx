import type { PeerSummary } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { ChatListItem } from "./ChatListItem";

export interface ChatListProps {
  peers: PeerSummary[];
  modeFor: (peerId: string) => TransferMode;
  onSelectPeer: (peerId: string) => void;
}

export function ChatList({
  peers,
  modeFor,
  onSelectPeer,
}: ChatListProps) {
  return (
    <section aria-labelledby="chats-heading" className="mt-6">
      <h2
        id="chats-heading"
        className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
      >
        Чаты
      </h2>
      {peers.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-4 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">
          Пока нет чатов
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {peers.map((peer) => (
            <ChatListItem
              key={peer.id}
              peer={peer}
              mode={modeFor(peer.id)}
              onSelect={onSelectPeer}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
