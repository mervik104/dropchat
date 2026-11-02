import type { ChatMessage, PeerSummary } from "@dropchat/shared";

import { formatClockTime } from "../../lib/format";
import { Avatar } from "../../ui/Avatar";
import { FileIcon, PlatformGlyph } from "../../ui/icons";

export interface ChatListItemProps {
  peer: PeerSummary;
  currentDeviceId: string;
  lastMessage?: ChatMessage;
  onSelect: (peerId: string) => void;
}

export function ChatListItem({
  peer,
  currentDeviceId,
  lastMessage,
  onSelect,
}: ChatListItemProps) {
  const preview = lastMessage
    ? lastMessage.kind === "file"
      ? `Файл: ${lastMessage.fileName}`
      : `${lastMessage.fromDevice === currentDeviceId ? "Вы: " : "Вам: "}${lastMessage.text}`
    : "Нет сообщений";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(peer.id)}
        className="group flex w-full items-center gap-3 rounded-card px-2.5 py-2.5 text-left transition-[background-color,transform] duration-150 ease-standard hover:bg-elevated active:scale-[0.995]"
      >
        <Avatar
          name={peer.name}
          seed={peer.id}
          size="md"
          online={peer.online}
          icon={<PlatformGlyph platform={peer.platform} size={16} />}
          decorative
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
              {peer.name}
            </span>
            {lastMessage ? (
              <span className="shrink-0 text-2xs font-medium tabular-nums text-muted">
                {formatClockTime(lastMessage.createdAt)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {lastMessage?.kind === "file" ? (
              <FileIcon size={13} className="shrink-0" />
            ) : null}
            <span className="truncate">{preview}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
