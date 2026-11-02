import type { ChatMessage } from "@dropchat/shared";

import { MessageBubble } from "./MessageBubble";

export interface MessageListProps {
  currentDeviceId: string;
  messages: ChatMessage[];
  nextBefore: string | null;
  loading: boolean;
  error: boolean;
  onLoadMore: (before: string) => void;
  onRetry: (message: ChatMessage) => Promise<void>;
  onDownload: (fileId: string) => Promise<void>;
  now: () => number;
}

export function MessageList({
  currentDeviceId,
  messages,
  nextBefore,
  loading,
  error,
  onLoadMore,
  onRetry,
  onDownload,
  now,
}: MessageListProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
      {nextBefore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => onLoadMore(nextBefore)}
          className="mx-auto rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-stone-700"
        >
          Загрузить ещё
        </button>
      ) : null}

      {loading ? (
        <p className="mt-4 text-center text-sm text-stone-500 dark:text-stone-400">
          Загрузка сообщений…
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">
          Не удалось загрузить сообщения
        </p>
      ) : null}

      {!loading && !error && messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <p className="text-base font-semibold">Сообщений пока нет</p>
            <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
              История этого чата появится после первого сообщения.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            currentDeviceId={currentDeviceId}
            now={now}
            onRetry={onRetry}
            onDownload={onDownload}
          />
        ))}
      </div>
    </div>
  );
}
