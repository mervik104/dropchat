import { useState, type FormEvent } from "react";

import {
  serializeIdentity,
  type DeviceIdentity,
} from "../../lib/identity";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Hint } from "../../ui/Hint";
import { GithubIcon, WarningIcon } from "../../ui/icons";
import { Input } from "../../ui/Input";
import { Logo } from "../../ui/Logo";
import { Modal } from "../../ui/Modal";
import { Switch } from "../../ui/Switch";
import { ImportForm } from "../invite/ImportForm";

export interface SettingsDialogProps {
  identity: DeviceIdentity;
  onClose: () => void;
  onSave: (name: string, invisible: boolean) => Promise<void>;
  onImportIdentity: (text: string) => Promise<void>;
}

export function SettingsDialog({
  identity,
  onClose,
  onSave,
  onImportIdentity,
}: SettingsDialogProps) {
  const [name, setName] = useState(identity.name);
  const [invisible, setInvisible] = useState(identity.invisible ?? false);
  const [saveError, setSaveError] = useState(false);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaveError(false);
    try {
      await onSave(name, invisible);
      onClose();
    } catch {
      setSaveError(true);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Настройки"
      description="Устройство, приватность и данные"
      variant="auto"
      size="md"
      closeLabel="Закрыть настройки"
    >
      <div className="space-y-3">
        <form
          onSubmit={handleSave}
          className="rounded-card border border-border bg-surface p-3.5"
        >
          <Input
            label="Имя устройства"
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, MacBook"
          />

          <Switch
            checked={invisible}
            onCheckedChange={setInvisible}
            label="Невидимый режим"
            description="Устройство не будет видно в разделе «Рядом»"
            className="mt-3"
          />

          <Button type="submit" fullWidth className="mt-3">
            Сохранить
          </Button>

          {saveError ? (
            <Hint
              tone="danger"
              icon={<WarningIcon />}
              className="mt-2"
            >
              Не удалось сохранить имя
            </Hint>
          ) : null}
        </form>

        <section className="rounded-card border border-border bg-surface p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">Экспорт identity</h3>
            <Badge tone="warning" size="sm">
              секрет
            </Badge>
          </div>
          <label htmlFor="identity-export" className="sr-only">
            Экспорт identity
          </label>
          <textarea
            id="identity-export"
            readOnly
            value={serializeIdentity(identity)}
            className="mt-2 h-28 w-full resize-none rounded-control border border-border bg-canvas p-3 font-mono text-xs text-fg focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <p className="mt-2 text-xs leading-5 text-muted">
            В тексте есть секрет устройства. Не передавайте его посторонним.
          </p>
        </section>

        <section className="rounded-card border border-border bg-surface p-3.5">
          <ImportForm onImport={onImportIdentity} />
        </section>

        <section className="rounded-card border border-border bg-canvas p-3.5">
          <div className="flex items-center gap-3">
            <Logo variant="mark" size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">DropChat</p>
              <p className="text-xs leading-5 text-muted">
                Прямая передача без аккаунта. Сообщения и файлы остаются между
                вашими устройствами.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
            <p className="text-xs text-muted">
              Автор{" "}
              <a
                href="https://mervik.ru"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent underline-offset-2 hover:underline"
              >
                mervik.ru
              </a>
            </p>
            <a
              href="https://github.com/mervik104/dropchat"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-fg transition-colors hover:bg-sunken"
            >
              <GithubIcon size={14} />
              GitHub
            </a>
          </div>
        </section>
      </div>
    </Modal>
  );
}
