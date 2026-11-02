import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { Logo } from "../../ui/Logo";
import { LinkIcon, SearchIcon, SettingsIcon } from "../../ui/icons";

export interface ChatListHeaderProps {
  deviceName: string;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
}

export function ChatListHeader({
  deviceName,
  onOpenSettings,
  onOpenInvite,
}: ChatListHeaderProps) {
  return (
    <header className="dc-pt-safe shrink-0 border-b border-border bg-surface/90 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-4 pb-2.5 pt-3">
        <div className="min-w-0 flex-1">
          <h1 className="min-w-0">
            <Logo size={30} variant="full" />
          </h1>
          <p className="mt-1 truncate text-[11px] font-medium tracking-wide text-muted">
            {deviceName}
          </p>
        </div>
        <IconButton
          label="Настройки"
          size="md"
          variant="ghost"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </IconButton>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-control bg-sunken px-3 text-muted transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent/25">
          <SearchIcon size={18} />
          <input
            aria-label="Поиск"
            placeholder="Поиск"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
          />
        </div>
        <Button
          size="md"
          variant="soft"
          aria-label="Код приглашения"
          onClick={onOpenInvite}
          leadingIcon={<LinkIcon size={18} />}
          className="px-3 sm:px-4"
        >
          <span className="hidden sm:inline">Код приглашения</span>
        </Button>
      </div>
    </header>
  );
}
