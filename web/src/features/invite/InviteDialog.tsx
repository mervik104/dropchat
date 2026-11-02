import { useState, type FormEvent } from "react";

import type { InviteResponse } from "@dropchat/shared";

export interface InviteDialogProps {
  onClose: () => void;
  onCreate: () => Promise<InviteResponse>;
  onRedeem: (code: string) => Promise<void>;
}

export function InviteDialog({
  onClose,
  onCreate,
  onRedeem,
}: InviteDialogProps) {
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      const invite = await onCreate();
      setCreatedCode(invite.code);
    } catch {
      setError("Не удалось создать код");
    }
  }

  async function handleRedeem(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onRedeem(code);
      onClose();
    } catch {
      setError("Не удалось применить код");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/50 px-4 py-6"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900">
        <div className="flex items-center justify-between gap-4">
          <h2 id="invite-title" className="text-xl font-semibold">
            Код приглашения
          </h2>
          <button
            type="button"
            aria-label="Закрыть окно приглашения"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
          >
            Закрыть
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleCreate()}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Создать код
        </button>
        {createdCode ? (
          <p className="mt-3 text-center font-mono text-2xl font-semibold tracking-[0.2em]">
            Код: {createdCode}
          </p>
        ) : null}

        <form
          onSubmit={handleRedeem}
          className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800"
        >
          <label htmlFor="invite-code" className="text-sm font-medium">
            Введите код
          </label>
          <input
            id="invite-code"
            value={code}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-lg tracking-[0.3em] dark:border-stone-700 dark:bg-stone-950"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Применить
          </button>
        </form>

        {error ? (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
