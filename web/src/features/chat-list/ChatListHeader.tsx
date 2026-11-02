export interface ChatListHeaderProps {
  deviceName: string;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
  onOpenOffline: () => void;
}

export function ChatListHeader({
  deviceName,
  onOpenSettings,
  onOpenInvite,
  onOpenOffline,
}: ChatListHeaderProps) {
  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">DropChat</h1>
          <p className="truncate text-sm text-stone-500 dark:text-stone-400">
            {deviceName}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Настройки
        </button>
      </header>

      <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <button
          type="button"
          onClick={onOpenInvite}
          className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Код приглашения
        </button>
        <button
          type="button"
          onClick={onOpenOffline}
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          Офлайн-передача
        </button>
      </div>
    </>
  );
}
