import { useState, type FormEvent } from "react";

export interface ComposerProps {
  onSend: (text: string) => Promise<void>;
  onAttach: (file: File) => void;
}

export function Composer({ onSend, onAttach }: ComposerProps) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    setText("");
    void onSend(trimmed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-800"
    >
      <label className="cursor-pointer rounded-full border border-stone-300 px-3 py-2 text-sm dark:border-stone-700">
        <span>Прикрепить</span>
        <input
          aria-label="Прикрепить файл"
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onAttach(file);
              event.target.value = "";
            }
          }}
        />
      </label>
      <input
        aria-label="Сообщение"
        value={text}
        maxLength={4_000}
        onChange={(event) => setText(event.target.value)}
        placeholder="Сообщение"
        className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
      />
      <button
        type="submit"
        className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
      >
        Отправить
      </button>
    </form>
  );
}
