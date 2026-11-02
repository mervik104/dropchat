import type { PeersResponse } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { ChatList } from "./ChatList";
import { ChatListHeader } from "./ChatListHeader";
import { IncomingRequests } from "./IncomingRequests";
import { NearbySection } from "./NearbySection";

export interface ChatListPanelProps {
  deviceName: string;
  peers: PeersResponse;
  sentRequests: Record<string, boolean>;
  hasSelection: boolean;
  modeFor: (peerId: string) => TransferMode;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
  onSelectPeer: (peerId: string) => void;
  onRequestPeer: (peerId: string) => void;
  onRespondRequest: (peerId: string, accept: boolean) => void;
}

export function ChatListPanel({
  deviceName,
  peers,
  sentRequests,
  hasSelection,
  modeFor,
  onOpenSettings,
  onOpenInvite,
  onSelectPeer,
  onRequestPeer,
  onRespondRequest,
}: ChatListPanelProps) {
  return (
    <aside
      className={[
        "w-full flex-col border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950 md:flex md:w-80 md:shrink-0 md:border-r",
        hasSelection ? "hidden" : "flex",
      ].join(" ")}
    >
      <ChatListHeader
        deviceName={deviceName}
        onOpenSettings={onOpenSettings}
        onOpenInvite={onOpenInvite}
      />

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NearbySection
          peers={peers.local}
          sentRequests={sentRequests}
          onRequestPeer={onRequestPeer}
        />

        <IncomingRequests
          requests={peers.incomingRequests}
          onRespond={onRespondRequest}
        />

        <ChatList
          peers={peers.linked}
          modeFor={modeFor}
          onSelectPeer={onSelectPeer}
        />
      </div>
    </aside>
  );
}
