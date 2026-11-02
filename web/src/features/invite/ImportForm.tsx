import { useState, type FormEvent } from "react";

export interface ImportFormProps {
  onImport: (text: string) => Promise<void>;
}

export function ImportForm({ onImport }: ImportFormProps) {
  const [text, setText] = useState("");
  const [importError, setImportError] = useState(false);

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    setImportError(false);
    try {
      await onImport(text);
    } catch {
      setImportError(true);
    }
  }

  return (
    <form onSubmit={handleImport}>
      <label htmlFor="identity-import" className="text-sm font-medium">
        Импорт identity
      </label>
      <textarea
        id="identity-import"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="mt-2 h-24 w-full resize-none rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
      />
      <button
        type="submit"
        className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
      >
        Импортировать
      </button>
      {importError ? (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          Не удалось импортировать identity
        </p>
      ) : null}
    </form>
  );
}
