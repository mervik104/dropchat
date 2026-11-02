import type { PeerSummary } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { MODE_LABEL } from "../transfer/modeLabels";
import { onlineDotClass } from "./onlineDotClass";

export interface ChatListItemProps {
  peer: PeerSummary;
  mode: TransferMode;
  onSelect: (peerId: string) => void;
}

export function ChatListItem({
  peer,
  mode,
  onSelect,
}: ChatListItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(peer.id)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white dark:hover:bg-stone-900"
      >
        <span
          aria-label={peer.online ? "онлайн" : "офлайн"}
          className={onlineDotClass(peer)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {peer.name}
          </span>
          <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
            Нет сообщений
          </span>
        </span>
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {MODE_LABEL[mode]}
        </span>
      </button>
    </li>
  );
}
