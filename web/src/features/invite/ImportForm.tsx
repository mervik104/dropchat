import { useState, type FormEvent } from "react";

import { Button } from "../../ui/Button";
import { Hint } from "../../ui/Hint";
import { WarningIcon } from "../../ui/icons";

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
      <label
        htmlFor="identity-import"
        className="text-sm font-semibold text-fg"
      >
        Импорт identity
      </label>
      <textarea
        id="identity-import"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Вставьте сохранённый ключ устройства"
        className="mt-2 h-24 w-full resize-none rounded-control border border-border bg-canvas p-3 font-mono text-xs text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/25"
      />
      <Button
        type="submit"
        variant="secondary"
        fullWidth
        className="mt-3"
      >
        Импортировать
      </Button>
      {importError ? (
        <Hint tone="danger" icon={<WarningIcon />} className="mt-2">
          Не удалось импортировать identity
        </Hint>
      ) : null}
    </form>
  );
}
