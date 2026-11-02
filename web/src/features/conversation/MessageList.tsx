import { useEffect, useRef } from "react";

import type { ChatMessage } from "@dropchat/shared";

import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Hint } from "../../ui/Hint";
import {
  RetryIcon,
  WarningIcon,
} from "../../ui/icons";
import { Skeleton } from "../../ui/Skeleton";
import { Spinner } from "../../ui/Spinner";
import { EmptyMessagesIllustration } from "./EmptyMessagesIllustration";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current!;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-label="Сообщения"
      className="dc-scroll-contain flex flex-1 flex-col overflow-y-auto bg-canvas/40 px-3.5 py-4 sm:px-5"
    >
      {nextBefore ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onLoadMore(nextBefore)}
          disabled={loading}
          leadingIcon={<RetryIcon size={15} />}
          className="mx-auto"
        >
          Загрузить ещё
        </Button>
      ) : null}

      {loading ? (
        <div className="mt-3">
          <p className="flex items-center justify-center gap-2 text-center text-xs font-medium text-muted">
            <Spinner size="sm" />
            Загрузка сообщений…
          </p>
          <div className="mt-4 space-y-3" aria-hidden="true">
            <Skeleton variant="block" className="h-12 w-[58%] rounded-bubble" />
            <Skeleton
              variant="block"
              className="ml-auto h-14 w-[46%] rounded-bubble"
            />
            <Skeleton variant="block" className="h-11 w-[64%] rounded-bubble" />
          </div>
        </div>
      ) : null}

      {error ? (
        <Hint tone="danger" icon={<WarningIcon />} className="mt-3">
          Не удалось загрузить сообщения
        </Hint>
      ) : null}

      {!loading && !error && messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            illustration={<EmptyMessagesIllustration />}
            title="Сообщений пока нет"
            description="История этого чата появится после первого сообщения."
          />
        </div>
      ) : null}

      <div className="mt-auto space-y-2 pt-4">
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
