import type { UploadState } from "../../app/types";
import { STATUS_LABEL } from "../transfer/modeLabels";

export interface UploadStripProps {
  upload: UploadState;
  onCancelUpload: () => void;
}

export function UploadStrip({
  upload,
  onCancelUpload,
}: UploadStripProps) {
  return (
    <div className="border-t border-stone-200 px-4 py-3 text-sm dark:border-stone-800">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 truncate">
          {upload.name} — {upload.percent}% · {STATUS_LABEL[upload.status]}
        </span>
        <button
          type="button"
          onClick={onCancelUpload}
          className="rounded-full border border-stone-300 px-2.5 py-1 text-xs dark:border-stone-700"
        >
          Отменить загрузку
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div
          className="h-full bg-sky-600 transition-all"
          style={{ width: `${upload.percent}%` }}
        />
      </div>
      {upload.error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          Не удалось отправить файл
        </p>
      ) : null}
    </div>
  );
}
