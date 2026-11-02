import type { ErrorKind } from "../../app/types";
import { ImportForm } from "../invite/ImportForm";

const ERROR_TITLE: Record<ErrorKind, string> = {
  identity: "Сервер не узнал устройство",
  rate_limit: "Слишком много попыток регистрации",
  generic: "Не удалось подключиться",
};

const ERROR_BODY: Record<ErrorKind, string> = {
  identity: "Локальная identity сохранена. Импортируйте её или сбросьте.",
  rate_limit: "Сервер ограничил регистрацию с этого IP. Попробуйте позже.",
  generic: "Проверьте подключение к сети и повторите попытку.",
};

export interface ErrorScreenProps {
  kind: ErrorKind;
  onRetry: () => void;
  onResetIdentity: () => Promise<void>;
  onImportIdentity: (text: string) => Promise<void>;
}

export function ErrorScreen({
  kind,
  onRetry,
  onResetIdentity,
  onImportIdentity,
}: ErrorScreenProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 px-6 py-10 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900">
        <h1 className="text-2xl font-semibold tracking-tight">DropChat</h1>
        <p className="mt-4 text-base font-semibold">{ERROR_TITLE[kind]}</p>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          {ERROR_BODY[kind]}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Повторить
        </button>

        {kind === "identity" ? (
          <div className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
            <ImportForm onImport={onImportIdentity} />
            <button
              type="button"
              onClick={onResetIdentity}
              className="mt-4 w-full rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
            >
              Сбросить identity
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
