import type { ChatMessage, PeersResponse } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { ChatList } from "./ChatList";
import { ChatListHeader } from "./ChatListHeader";
import { IncomingRequests } from "./IncomingRequests";
import { NearbySection } from "./NearbySection";

export interface ChatListPanelProps {
  deviceName: string;
  peers: PeersResponse;
  messagesByPeer: Record<string, ChatMessage[]>;
  currentDeviceId: string;
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
  messagesByPeer,
  currentDeviceId,
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
        "w-full flex-col border-border bg-canvas md:flex md:w-[360px] md:shrink-0 md:border-r",
        hasSelection ? "hidden" : "flex",
      ].join(" ")}
    >
      <ChatListHeader
        deviceName={deviceName}
        onOpenSettings={onOpenSettings}
        onOpenInvite={onOpenInvite}
      />

      <div className="dc-scroll-contain flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
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
          messagesByPeer={messagesByPeer}
          currentDeviceId={currentDeviceId}
          modeFor={modeFor}
          onSelectPeer={onSelectPeer}
        />
      </div>
    </aside>
  );
}
