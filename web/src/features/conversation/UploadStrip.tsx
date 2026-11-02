import type { UploadState } from "../../app/types";
import { IconButton } from "../../ui/IconButton";
import { CancelIcon, FileIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";
import { STATUS_LABEL } from "../transfer/modeLabels";

export interface UploadStripProps {
  uploads: UploadState[];
  onCancelUpload: (id: string) => void;
}

export function UploadStrip({ uploads, onCancelUpload }: UploadStripProps) {
  return (
    <div className="max-h-48 shrink-0 overflow-y-auto border-t border-border bg-surface px-4 py-2.5">
      <div className="space-y-2.5">
        {uploads.map((upload) => (
          <div key={upload.id}>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-soft-fg"
              >
                <FileIcon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                    {upload.name} — {upload.percent}% ·{" "}
                    {STATUS_LABEL[upload.status]}
                  </span>
                </div>
                <ProgressBar
                  value={upload.percent}
                  size="sm"
                  tone={upload.error ? "danger" : "accent"}
                  label={`Загрузка ${upload.name}`}
                  className="mt-1.5"
                />
              </div>
              <IconButton
                label="Отменить загрузку"
                size="sm"
                variant="ghost"
                onClick={() => onCancelUpload(upload.id)}
              >
                <CancelIcon />
              </IconButton>
            </div>
            {upload.error ? (
              <p className="mt-1.5 pl-10 text-xs font-medium text-danger">
                Не удалось отправить файл
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
