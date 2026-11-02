import type { ChatMessage } from "@dropchat/shared";

import { FileBubble } from "./FileBubble";

export interface MessageBubbleProps {
  message: ChatMessage;
  currentDeviceId: string;
  now: () => number;
  onRetry: (message: ChatMessage) => Promise<void>;
  onDownload: (fileId: string) => Promise<void>;
}

export function MessageBubble({
  message,
  currentDeviceId,
  now,
  onRetry,
  onDownload,
}: MessageBubbleProps) {
  const own = message.fromDevice === currentDeviceId;
  const expired = message.kind === "file" && message.expiresAt <= now();

  return (
    <div className={own ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
          own
            ? "bg-sky-600 text-white"
            : "bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
        ].join(" ")}
      >
        {message.kind === "file" ? (
          <FileBubble
            message={message}
            own={own}
            expired={expired}
            onDownload={onDownload}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        )}
        {message.status === "sending" ? (
          <p className="mt-1 text-[11px] opacity-70">Отправка…</p>
        ) : message.status === "failed" ? (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-rose-200">
            <span>Ошибка отправки</span>
            <button
              type="button"
              onClick={() => void onRetry(message)}
              className="rounded-full border border-rose-200 px-2 py-0.5 font-medium"
            >
              Повторить
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
