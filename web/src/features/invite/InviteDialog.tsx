import { useState, type FormEvent } from "react";

import type { InviteResponse } from "@dropchat/shared";

import { Button } from "../../ui/Button";
import { CopyButton } from "../../ui/CopyButton";
import { cx } from "../../ui/cx";
import { Hint } from "../../ui/Hint";
import {
  ClockIcon,
  CodeIcon,
  LinkIcon,
  WarningIcon,
} from "../../ui/icons";
import { Modal } from "../../ui/Modal";

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
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      const invite = await onCreate();
      setCreatedCode(invite.code);
      setExpiresAt(invite.expiresAt);
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

  const countdownSeconds = expiresAt
    ? Math.max(1, (expiresAt - Date.now()) / 1000)
    : 300;

  return (
    <Modal
      open
      onClose={onClose}
      title="Код приглашения"
      description="Одноразовый код связывает два устройства"
      variant="auto"
      size="md"
      closeLabel="Закрыть окно приглашения"
    >
      <div className="space-y-4">
        <section className="rounded-card border border-border bg-canvas p-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-control bg-accent-soft text-accent-soft-fg"
            >
              <LinkIcon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Мой код</p>
              <p className="text-xs text-muted">
                Покажите его на другом устройстве
              </p>
            </div>
            <Button
              size="sm"
              variant="soft"
              onClick={() => void handleCreate()}
            >
              Создать код
            </Button>
          </div>

          {createdCode ? (
            <>
              <p className="sr-only">Код: {createdCode}</p>
              <div className="mt-4 flex items-center gap-2">
                <div className="grid flex-1 grid-cols-6 gap-1.5">
                  {Array.from({ length: 6 }, (_, index) => (
                    <span
                      key={index}
                      className="flex h-12 items-center justify-center rounded-control border border-border bg-surface font-mono text-xl font-semibold tracking-[0.08em] text-fg shadow-soft"
                    >
                      {createdCode.slice(index, index + 1)}
                    </span>
                  ))}
                </div>
                <CopyButton
                  text={createdCode}
                  label="Скопировать код"
                  className="shrink-0"
                />
              </div>

              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-pill bg-border/60">
                  <div
                    className="h-full origin-left animate-countdown rounded-pill bg-accent"
                    style={{ animationDuration: `${countdownSeconds}s` }}
                  />
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-2xs font-medium text-muted">
                  <ClockIcon size={13} />
                  Код действует 5 минут
                </p>
              </div>
            </>
          ) : (
            <p className="mt-4 flex items-center gap-2 rounded-control border border-dashed border-border bg-surface/60 px-3 py-3 text-xs text-muted">
              <CodeIcon size={16} />
              Создайте код, чтобы пригласить второе устройство.
            </p>
          )}
        </section>

        <form
          onSubmit={handleRedeem}
          className="rounded-card border border-border bg-surface p-4"
        >
          <label htmlFor="invite-code" className="text-sm font-semibold text-fg">
            Введите код
          </label>
          <div className="relative mt-2">
            <input
              id="invite-code"
              value={code}
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value)}
              className="absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 focus:outline-none"
            />
            <div
              className={cx(
                "grid grid-cols-6 gap-1.5 rounded-control transition-shadow focus-within:ring-2 focus-within:ring-accent/25",
                error && "animate-shake",
              )}
              aria-hidden="true"
            >
              {Array.from({ length: 6 }, (_, index) => {
                const digit = code.slice(index, index + 1);
                return (
                  <span
                    key={index}
                    className={cx(
                      "flex h-12 items-center justify-center rounded-control border bg-canvas font-mono text-xl font-semibold text-fg",
                      digit
                        ? "border-accent/40"
                        : "border-border text-muted",
                    )}
                  >
                    {digit || "·"}
                  </span>
                );
              })}
            </div>
          </div>

          <Button
            type="submit"
            variant="secondary"
            fullWidth
            className="mt-3"
            disabled={code.length === 0}
          >
            Применить
          </Button>

          {error ? (
            <Hint tone="danger" icon={<WarningIcon />} className="mt-3">
              {error}
            </Hint>
          ) : null}
        </form>
      </div>
    </Modal>
  );
}
