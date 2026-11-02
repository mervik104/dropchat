import type { ChatMessage } from "@dropchat/shared";

import { formatFileSize } from "../../lib/format";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import {
  BoltIcon,
  CloudIcon,
  DownloadIcon,
  FileKindIcon,
} from "../../ui/icons";

export interface FileBubbleProps {
  message: ChatMessage;
  own: boolean;
  expired: boolean;
  onDownload: (fileId: string) => Promise<void>;
}

export function FileBubble({
  message,
  own,
  expired,
  onDownload,
}: FileBubbleProps) {
  return (
    <div className="min-w-52 max-w-full">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cx(
            "flex size-10 shrink-0 items-center justify-center rounded-control",
            own ? "bg-current/15 text-current" : "bg-surface/80 text-accent",
          )}
        >
          <FileKindIcon
            fileName={message.fileName}
            mime={message.mime}
            size={20}
          />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="break-words font-semibold leading-5 [overflow-wrap:anywhere]">
            {message.fileName}
          </p>
          <p className="mt-0.5 text-xs">{formatFileSize(message.fileSize!)}</p>
        </div>
      </div>

      {message.transport === "cloud" ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px]">
          <CloudIcon size={13} />
          <span>хранится 30 дней</span>
        </p>
      ) : message.transport === "p2p" ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px]">
          <BoltIcon size={13} />
          <span>передано напрямую</span>
        </p>
      ) : null}

      {expired ? (
        <p className="mt-2 text-xs font-semibold">истёк</p>
      ) : message.fileId ? (
        <Button
          size="sm"
          variant={own ? "secondary" : "soft"}
          onClick={() => void onDownload(message.fileId!)}
          leadingIcon={<DownloadIcon size={15} />}
          className={cx(
            "mt-2.5",
            own &&
              "border-current/30 bg-current/10 text-current shadow-none hover:bg-current/15 active:bg-current/15",
          )}
        >
          Скачать
        </Button>
      ) : null}
    </div>
  );
}
