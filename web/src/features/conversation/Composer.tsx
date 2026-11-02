import {
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { PaperclipIcon, SendIcon, UploadIcon } from "../../ui/icons";

const MAX_INPUT_HEIGHT = 160;

export interface ComposerProps {
  onSend: (text: string) => Promise<void>;
  onAttach: (files: File[]) => void;
}

export function Composer({ onSend, onAttach }: ComposerProps) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Автогроу: растёт до MAX_INPUT_HEIGHT, дальше скролл внутри поля.
  useLayoutEffect(() => {
    const el = textareaRef.current!;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [text]);

  const canSend = text.trim().length > 0;

  function submit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    setText("");
    void onSend(trimmed);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    // Как в Telegram: на тач-устройствах Enter переносит строку,
    // на ПК Enter отправляет, Shift+Enter переносит строку.
    const isTouch =
      window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (isTouch) {
      return;
    }
    event.preventDefault();
    submit();
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onAttach(files);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className="relative flex w-full min-w-0 max-w-full shrink-0 items-end gap-1.5 border-t border-border bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:px-3 sm:pt-2.5 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <label
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg focus-within:ring-2 focus-within:ring-focus/40"
        title="Прикрепить файл"
      >
        <PaperclipIcon size={22} />
        <input
          aria-label="Прикрепить файл"
          type="file"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) {
              onAttach(files);
              event.target.value = "";
            }
          }}
        />
      </label>

      <div className="flex min-w-0 flex-1 items-end rounded-[20px] bg-sunken px-3.5 transition-shadow focus-within:ring-2 focus-within:ring-accent/25">
        <textarea
          ref={textareaRef}
          aria-label="Сообщение"
          value={text}
          rows={1}
          maxLength={4_000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение"
          className="dc-composer-input block max-h-40 min-h-10 w-full min-w-0 resize-none bg-transparent py-2.5 text-base leading-5 text-fg placeholder:text-muted focus:outline-none sm:text-[15px]"
        />
      </div>

      <button
        type="submit"
        aria-label="Отправить"
        disabled={!canSend}
        className={
          "flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 " +
          (canSend
            ? "bg-accent text-white hover:brightness-110 active:scale-95"
            : "cursor-default bg-sunken text-muted")
        }
      >
        <SendIcon size={18} />
      </button>

      {dragging ? (
        <div className="absolute inset-2 z-10 flex animate-dialog-in flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-accent bg-surface/95 text-center shadow-pop backdrop-blur-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent animate-pulse">
            <UploadIcon size={24} />
          </span>
          <p className="text-sm font-semibold text-fg">Отпустите, чтобы отправить</p>
          <p className="text-xs text-muted">Файл уйдёт этому устройству</p>
        </div>
      ) : null}
    </form>
  );
}
