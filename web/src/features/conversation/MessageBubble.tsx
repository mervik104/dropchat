import type { ChatMessage } from "@dropchat/shared";

import { formatClockTime } from "../../lib/format";
import { CopyButton } from "../../ui/CopyButton";
import { cx } from "../../ui/cx";
import {
  BoltIcon,
  ClockIcon,
  CloudIcon,
  DoubleCheckIcon,
  TrashIcon,
  WarningIcon,
} from "../../ui/icons";
import { FileBubble } from "./FileBubble";

export interface MessageBubbleProps {
  message: ChatMessage;
  currentDeviceId: string;
  now: () => number;
  onRetry: (message: ChatMessage) => Promise<void>;
  onDownload: (fileId: string) => Promise<void>;
  onDelete: (message: ChatMessage) => void;
}

export function MessageBubble({
  message,
  currentDeviceId,
  now,
  onRetry,
  onDownload,
  onDelete,
}: MessageBubbleProps) {
  const own = message.fromDevice === currentDeviceId;
  const deletable = own && message.transport !== "p2p";
  const expired = message.kind === "file" && message.expiresAt <= now();

  return (
    <div className={cx("flex animate-message-in", own ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "group relative max-w-[86%] rounded-bubble px-3.5 py-2.5 text-sm shadow-soft sm:max-w-[72%]",
          own
            ? message.transport === "p2p"
              ? "rounded-br-md bg-bubble-local text-bubble-local-fg [text-shadow:0_1px_2px_rgb(0_0_0_/_0.25)]"
              : "rounded-br-md bg-bubble-out text-bubble-out-fg"
            : "rounded-bl-md bg-bubble-in text-bubble-in-fg",
        )}
      >
        {message.kind === "file" ? (
          <FileBubble
            message={message}
            own={own}
            expired={expired}
            onDownload={onDownload}
          />
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words pr-6 [overflow-wrap:anywhere]">
              {message.text}
            </p>
            <CopyButton
              text={message.text!}
              label="Копировать текст"
              className={cx(
                "absolute right-1 top-1 opacity-60 transition-opacity duration-150 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                own
                  ? "text-current hover:bg-current/10"
                  : "text-muted hover:bg-black/5",
              )}
            />
          </>
        )}

        {message.status === "failed" ? (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-current">
            <WarningIcon size={13} />
            <span>Ошибка отправки</span>
            <button
              type="button"
              onClick={() => void onRetry(message)}
              className="rounded-full border border-current/35 px-2 py-0.5 font-semibold transition-colors hover:bg-current/10"
            >
              Повторить
            </button>
          </div>
        ) : null}

        <div
          className={cx(
            "mt-1 flex items-center justify-end gap-1 text-[11px]",
            own ? "text-current" : "text-muted",
          )}
        >
          {message.kind === "text" ? (
            <span className="mr-auto flex items-center gap-1">
              {message.transport === "p2p" ? (
                <BoltIcon size={11} />
              ) : (
                <CloudIcon size={11} />
              )}
              <span>{message.transport === "p2p" ? "локально" : "интернет"}</span>
            </span>
          ) : null}
          {message.status === "sending" ? (
            <>
              <ClockIcon size={12} />
              <span>Отправка…</span>
            </>
          ) : null}
          {message.status === "sent" ? <DoubleCheckIcon size={13} /> : null}
          <span className="tabular-nums">
            {formatClockTime(message.createdAt)}
          </span>
          {deletable ? (
            <button
              type="button"
              aria-label="Удалить сообщение"
              title="Удалить сообщение"
              onClick={() => onDelete(message)}
              className="ml-0.5 rounded p-0.5 text-current opacity-100 transition-opacity hover:bg-current/10 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <TrashIcon size={12} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
