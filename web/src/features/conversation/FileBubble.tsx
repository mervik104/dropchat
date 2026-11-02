import type { ChatMessage } from "@dropchat/shared";

import { formatFileSize } from "../../lib/format";

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
    <div className="min-w-52">
      <p className="font-medium break-all">{message.fileName}</p>
      <p className="mt-1 text-xs opacity-70">
        {formatFileSize(message.fileSize!)}
      </p>
      {message.transport === "cloud" ? (
        <p className="mt-1 text-[11px] opacity-70">хранится 30 дней</p>
      ) : message.transport === "p2p" ? (
        <p className="mt-1 text-[11px] opacity-70">передано напрямую</p>
      ) : null}
      {expired ? (
        <p className="mt-2 text-xs font-medium">истёк</p>
      ) : message.fileId ? (
        <button
          type="button"
          onClick={() => void onDownload(message.fileId!)}
          className={[
            "mt-2 rounded-full px-3 py-1 text-xs font-semibold",
            own ? "bg-white/20 text-white" : "bg-sky-600 text-white",
          ].join(" ")}
        >
          Скачать
        </button>
      ) : null}
    </div>
  );
}
