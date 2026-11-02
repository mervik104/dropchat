import { useEffect, useState, type FormEvent } from "react";

import type { DriveHealthResponse } from "@dropchat/shared";

import { formatPlatform } from "../../lib/format";
import {
  serializeIdentity,
  type DeviceIdentity,
} from "../../lib/identity";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Hint } from "../../ui/Hint";
import {
  DesktopIcon,
  MoonIcon,
  SunIcon,
  WarningIcon,
} from "../../ui/icons";
import { Input } from "../../ui/Input";
import { Logo } from "../../ui/Logo";
import { Modal } from "../../ui/Modal";
import { Switch } from "../../ui/Switch";
import { ImportForm } from "../invite/ImportForm";
import { DriveQuotaCard, type DriveQuotaState } from "./DriveQuotaCard";

export interface SettingsDialogProps {
  identity: DeviceIdentity;
  onClose: () => void;
  onSave: (name: string, invisible: boolean) => Promise<void>;
  onImportIdentity: (text: string) => Promise<void>;
  loadDriveHealth: () => Promise<DriveHealthResponse>;
}

export function SettingsDialog({
  identity,
  onClose,
  onSave,
  onImportIdentity,
  loadDriveHealth,
}: SettingsDialogProps) {
  const [name, setName] = useState(identity.name);
  const [invisible, setInvisible] = useState(identity.invisible ?? false);
  const [saveError, setSaveError] = useState(false);
  const [driveHealth, setDriveHealth] = useState<DriveQuotaState>({
    status: "loading",
  });

  useEffect(() => {
    void loadDriveHealth()
      .then((health) => {
        setDriveHealth({
          status: "ready",
          used: health.quotaUsed,
          limit: health.quotaLimit,
        });
      })
      .catch(() => {
        setDriveHealth({ status: "error" });
      });
  }, [loadDriveHealth]);

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
        <DriveQuotaCard health={driveHealth} />

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-card border border-border bg-canvas p-3">
            <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.12em] text-muted">
              <DesktopIcon size={14} />
              Платформа
            </span>
            <p className="mt-1 truncate text-sm font-semibold text-fg">
              {formatPlatform(identity.platform)}
            </p>
          </div>
          <div className="rounded-card border border-border bg-canvas p-3">
            <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.12em] text-muted">
              <SunIcon size={14} />
              <MoonIcon size={14} />
              Тема
            </span>
            <p className="mt-1 truncate text-sm font-semibold text-fg">
              как в системе
            </p>
          </div>
        </div>

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

        <section className="flex items-center gap-3 rounded-card border border-border bg-canvas p-3.5">
          <Logo variant="mark" size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">DropChat</p>
            <p className="text-xs leading-5 text-muted">
              Прямая передача без аккаунта. Сообщения и файлы остаются между
              вашими устройствами.
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
