export interface NotificationBannerProps {
  message: string;
  onDismiss: () => void;
}

export function NotificationBanner({
  message,
  onDismiss,
}: NotificationBannerProps) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-30 mx-auto flex max-w-lg items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-xl"
    >
      <span className="min-w-0 flex-1">{message}</span>
      <button
        type="button"
        aria-label="Скрыть уведомление"
        onClick={onDismiss}
        className="rounded-lg border border-white/40 px-2 py-1 text-xs"
      >
        Скрыть
      </button>
    </div>
  );
}
