import {
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Button } from "../../ui/Button";
import { PaperclipIcon, SendIcon, UploadIcon } from "../../ui/icons";

export interface ComposerProps {
  onSend: (text: string) => Promise<void>;
  onAttach: (files: File[]) => void;
}

export function Composer({ onSend, onAttach }: ComposerProps) {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);

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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
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
      className="dc-pb-safe relative flex shrink-0 items-end gap-2 border-t border-border bg-surface px-3 py-2.5"
    >
      <label
        className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-fg focus-within:ring-2 focus-within:ring-focus/40"
        title="Прикрепить файл"
      >
        <PaperclipIcon size={20} />
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

      <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-[22px] bg-sunken px-3.5 py-1 transition-shadow focus-within:ring-2 focus-within:ring-accent/25">
        <textarea
          aria-label="Сообщение"
          value={text}
          rows={1}
          maxLength={4_000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение"
          className="dc-composer-input max-h-32 min-h-9 w-full resize-none bg-transparent py-1.5 text-base leading-6 text-fg placeholder:text-muted focus:outline-none sm:text-sm"
        />
      </div>

      <Button
        type="submit"
        size="md"
        aria-label="Отправить"
        disabled={text.trim().length === 0}
        className="size-11 shrink-0 rounded-full px-0"
      >
        <SendIcon size={19} />
        <span className="sr-only">Отправить</span>
      </Button>

      {dragging ? (
        <div className="absolute inset-2 z-10 flex animate-dialog-in flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-accent bg-surface/95 text-center shadow-pop backdrop-blur-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent animate-pulse">
            <UploadIcon size={24} />
          </span>
          <p className="text-sm font-semibold text-fg">
            Отпустите, чтобы отправить
          </p>
          <p className="text-xs text-muted">Файл уйдёт этому устройству</p>
        </div>
      ) : null}
    </form>
  );
}
