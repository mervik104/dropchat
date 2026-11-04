import type { ConnectionState } from "../../app/types";
import { Spinner } from "../../ui/Spinner";

export interface ConnectionBadgeProps {
  state: ConnectionState;
}

export function ConnectionBadge({ state }: ConnectionBadgeProps) {
  if (state === "online") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium text-muted shadow-card backdrop-blur"
    >
      <Spinner size="sm" />
      <span>
        {state === "error"
          ? "Ошибка соединения — переподключение…"
          : "Соединение…"}
      </span>
    </div>
  );
}
