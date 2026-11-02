import type { ErrorKind } from "../../app/types";
import { Button } from "../../ui/Button";
import { Hint } from "../../ui/Hint";
import { WarningIcon } from "../../ui/icons";
import { Logo } from "../../ui/Logo";
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
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-10 text-fg">
      <div className="w-full max-w-md animate-dialog-in rounded-sheet border border-border bg-elevated p-6 shadow-sheet">
        <h1>
          <Logo size={40} variant="full" />
        </h1>

        <div className="mt-5 rounded-card border border-danger/20 bg-danger-soft p-3.5">
          <p className="flex items-center gap-2 text-base font-semibold text-danger">
            <WarningIcon size={18} />
            {ERROR_TITLE[kind]}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-fg/80">
            {ERROR_BODY[kind]}
          </p>
        </div>

        <Button fullWidth className="mt-4" onClick={onRetry}>
          Повторить
        </Button>

        {kind === "identity" ? (
          <div className="mt-5 border-t border-border pt-5">
            <ImportForm onImport={onImportIdentity} />
            <Button
              variant="danger"
              fullWidth
              className="mt-3"
              onClick={onResetIdentity}
            >
              Сбросить identity
            </Button>
            <Hint tone="warning" className="mt-3">
              Сброс удалит локальный ключ устройства. Это действие нельзя
              отменить.
            </Hint>
          </div>
        ) : null}
      </div>
    </main>
  );
}
