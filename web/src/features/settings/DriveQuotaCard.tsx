import { formatFileSize } from "../../lib/format";

export type DriveQuotaState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; used: number; limit: number };

export interface DriveQuotaCardProps {
  health: DriveQuotaState;
}

export function DriveQuotaCard({ health }: DriveQuotaCardProps) {
  return (
    <div className="mt-5 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-950">
      <p className="font-medium">Google Drive</p>
      <p className="mt-1 text-stone-600 dark:text-stone-300">
        {health.status === "loading"
          ? "Проверка Google Drive…"
          : health.status === "error"
            ? "Не удалось получить квоту Google Drive"
            : `Использовано ${formatFileSize(health.used)} из ${formatFileSize(health.limit)}`}
      </p>
    </div>
  );
}
