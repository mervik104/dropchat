import { formatFileSize } from "../../lib/format";
import { Badge } from "../../ui/Badge";
import { CloudIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";
import { Skeleton } from "../../ui/Skeleton";

export type DriveQuotaState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; used: number; limit: number };

export interface DriveQuotaCardProps {
  health: DriveQuotaState;
}

export function DriveQuotaCard({ health }: DriveQuotaCardProps) {
  return (
    <div className="rounded-card border border-border bg-canvas p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-control bg-surface text-accent shadow-soft"
        >
          <CloudIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Google Drive</p>
          {health.status === "loading" ? (
            <p className="mt-1 text-xs text-muted">Проверка Google Drive…</p>
          ) : health.status === "error" ? (
            <p className="mt-1 text-xs font-medium text-danger">
              Не удалось получить квоту Google Drive
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Использовано {formatFileSize(health.used)} из{" "}
              {formatFileSize(health.limit)}
            </p>
          )}
        </div>
        {health.status === "ready" ? (
          <Badge tone="accent" size="sm">
            облако
          </Badge>
        ) : null}
      </div>

      {health.status === "ready" ? (
        <ProgressBar
          value={(health.used / health.limit) * 100}
          size="sm"
          label="Квота Google Drive"
          className="mt-2.5"
        />
      ) : health.status === "loading" ? (
        <Skeleton variant="text" className="mt-3" />
      ) : null}
    </div>
  );
}
