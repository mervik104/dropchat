import type { PeerSummary } from "@dropchat/shared";

import type { TransferMode } from "../../lib/transfer-mode";
import { MODE_LABEL } from "../transfer/modeLabels";

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
    <header className="flex items-center gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
      <button
        type="button"
        aria-label="Назад"
        onClick={onBack}
        className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium md:hidden dark:border-stone-700"
      >
        Назад
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold">{peer.name}</h2>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {peer.online ? "в сети" : "не в сети"}
        </p>
      </div>
      <div
        role="group"
        aria-label="Режим передачи"
        className="flex rounded-full bg-stone-200 p-0.5 text-xs font-medium dark:bg-stone-800"
      >
        {(["auto", "local", "cloud"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-label={`Режим ${MODE_LABEL[option]}`}
            aria-pressed={mode === option}
            onClick={() => onModeChange(option)}
            className={[
              "rounded-full px-2.5 py-1 transition",
              mode === option
                ? "bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100"
                : "text-stone-600 dark:text-stone-300",
            ].join(" ")}
          >
            {MODE_LABEL[option]}
          </button>
        ))}
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label="Действия с чатом"
          onClick={onToggleMenu}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium dark:border-stone-700"
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900">
            <button
              type="button"
              onClick={() => void onUnlink()}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Отвязать устройство
            </button>
            <button
              type="button"
              onClick={() => void onBlock()}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
            >
              Заблокировать устройство
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
