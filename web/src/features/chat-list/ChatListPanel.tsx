import { useState } from "react";

import type { ChatMessage, PeersResponse } from "@dropchat/shared";

import type { ConnectionState } from "../../app/types";

import { EmptyState } from "../../ui/EmptyState";
import { SearchIcon } from "../../ui/icons";
import { ChatList } from "./ChatList";
import { ChatListHeader } from "./ChatListHeader";
import { IncomingRequests } from "./IncomingRequests";
import { NearbySection } from "./NearbySection";

export interface ChatListPanelProps {
  deviceName: string;
  peers: PeersResponse;
  messagesByPeer: Record<string, ChatMessage[]>;
  currentDeviceId: string;
  unreadByPeer: Record<string, number>;
  sentRequests: Record<string, boolean>;
  hasSelection: boolean;
  connectionState: ConnectionState;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
  onSelectPeer: (peerId: string) => void;
  onRequestPeer: (peerId: string) => void;
  onRespondRequest: (peerId: string, accept: boolean) => void;
  onRefresh: () => void;
}

export function ChatListPanel({
  deviceName,
  peers,
  messagesByPeer,
  currentDeviceId,
  unreadByPeer,
  sentRequests,
  hasSelection,
  connectionState,
  onOpenSettings,
  onOpenInvite,
  onSelectPeer,
  onRequestPeer,
  onRespondRequest,
  onRefresh,
}: ChatListPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  const matches = (name: string) =>
    name.toLowerCase().includes(normalizedQuery);

  const filteredPeers: PeersResponse = {
    local: peers.local.filter((peer) => matches(peer.name)),
    incomingRequests: peers.incomingRequests.filter((peer) =>
      matches(peer.name),
    ),
    linked: peers.linked.filter((peer) => matches(peer.name)),
  };

  const hasResults =
    filteredPeers.local.length +
      filteredPeers.incomingRequests.length +
      filteredPeers.linked.length >
    0;

  return (
    <aside
      className={[
        "w-full flex-col border-border bg-canvas md:flex md:w-[360px] md:shrink-0 md:border-r",
        hasSelection ? "hidden" : "flex",
      ].join(" ")}
    >
      <ChatListHeader
        deviceName={deviceName}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSettings={onOpenSettings}
        onOpenInvite={onOpenInvite}
      />

      {connectionState === "local" ? (
        <div
          role="status"
          className="mx-3 mt-3 rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning"
        >
          Доступен только локальный режим
        </div>
      ) : null}

      <div className="dc-scroll-contain flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {searching && !hasResults ? (
          <EmptyState
            compact
            className="mt-3"
            icon={<SearchIcon />}
            title="Ничего не найдено"
            description="Попробуйте изменить запрос или обновить список устройств."
          />
        ) : (
          <>
            {!searching || filteredPeers.local.length > 0 ? (
              <NearbySection
                peers={filteredPeers.local}
                sentRequests={sentRequests}
                onRequestPeer={onRequestPeer}
                onRefresh={onRefresh}
              />
            ) : null}

            <IncomingRequests
              requests={filteredPeers.incomingRequests}
              onRespond={onRespondRequest}
            />

            {!searching || filteredPeers.linked.length > 0 ? (
              <ChatList
                peers={filteredPeers.linked}
                messagesByPeer={messagesByPeer}
                currentDeviceId={currentDeviceId}
                unreadByPeer={unreadByPeer}
                onSelectPeer={onSelectPeer}
              />
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
