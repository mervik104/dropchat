import type { PeerSummary } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { Avatar } from "../../ui/Avatar";
import { IconButton } from "../../ui/IconButton";
import {
  BackIcon,
  LockIcon,
  MoreIcon,
  PlatformGlyph,
  TrashIcon,
} from "../../ui/icons";
import { ModeSwitch } from "./ModeSwitch";

export interface ConversationHeaderProps {
  peer: PeerSummary;
  mode: TransferMode;
  onModeChange: (mode: TransferMode) => void;
  menuOpen: boolean;
  onBack: () => void;
  onToggleMenu: () => void;
  onUnlink: () => Promise<void>;
  onBlock: () => Promise<void>;
}

export function ConversationHeader({
  peer,
  mode,
  onModeChange,
  menuOpen,
  onBack,
  onToggleMenu,
  onUnlink,
  onBlock,
}: ConversationHeaderProps) {
  return (
    <header className="dc-pt-safe shrink-0 border-b border-border bg-surface/90 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-2.5 pb-1.5 pt-2 sm:px-4">
        <IconButton
          label="Назад"
          variant="ghost"
          size="md"
          onClick={onBack}
          className="md:hidden"
        >
          <BackIcon />
        </IconButton>

        <Avatar
          name={peer.name}
          seed={peer.id}
          size="md"
          online={peer.online}
          icon={<PlatformGlyph platform={peer.platform} size={16} />}
          decorative
        />

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight text-fg">
            {peer.name}
          </h2>
          <p className="truncate text-xs text-muted">
            {peer.online ? "в сети" : "не в сети"}
          </p>
        </div>

        <div className="relative">
          <IconButton
            label="Действия с чатом"
            variant="ghost"
            size="md"
            onClick={onToggleMenu}
            aria-expanded={menuOpen}
          >
            <MoreIcon />
          </IconButton>

          {menuOpen ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-60 animate-dialog-in rounded-card border border-border bg-elevated p-1.5 shadow-pop">
              <button
                type="button"
                onClick={() => void onUnlink()}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-sunken"
              >
                <TrashIcon size={18} className="text-muted" />
                Отвязать устройство
              </button>
              <button
                type="button"
                onClick={() => void onBlock()}
                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
              >
                <LockIcon size={18} />
                Заблокировать устройство
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2.5 sm:px-4">
        <span className="hidden shrink-0 text-2xs font-medium uppercase tracking-[0.14em] text-muted sm:block">
          Передача
        </span>
        <div className="flex-1 sm:flex-none">
          <ModeSwitch mode={mode} onModeChange={onModeChange} />
        </div>
      </div>
    </header>
  );
}
