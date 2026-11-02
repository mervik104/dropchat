import { useEffect, useState, type FormEvent } from "react";

import type { DriveHealthResponse } from "@dropchat/shared";

import {
  serializeIdentity,
  type DeviceIdentity,
} from "../../lib/identity";
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/50 px-4 py-6"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900">
        <div className="flex items-center justify-between gap-4">
          <h2 id="settings-title" className="text-xl font-semibold">
            Настройки
          </h2>
          <button
            type="button"
            aria-label="Закрыть настройки"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
          >
            Закрыть
          </button>
        </div>

        <DriveQuotaCard health={driveHealth} />

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Платформа</dt>
            <dd className="font-medium">{identity.platform}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Тема</dt>
            <dd className="font-medium">как в системе</dd>
          </div>
        </dl>

        <form
          onSubmit={handleSave}
          className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800"
        >
          <label htmlFor="device-name" className="text-sm font-medium">
            Имя устройства
          </label>
          <input
            id="device-name"
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invisible}
              onChange={(event) => setInvisible(event.target.checked)}
            />
            Невидимый режим
          </label>
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Сохранить
          </button>
          {saveError ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              Не удалось сохранить имя
            </p>
          ) : null}
        </form>

        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
          <label htmlFor="identity-export" className="text-sm font-medium">
            Экспорт identity
          </label>
          <textarea
            id="identity-export"
            readOnly
            value={serializeIdentity(identity)}
            className="mt-2 h-28 w-full resize-none rounded-xl border border-stone-300 bg-stone-50 p-3 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
          />
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            В тексте есть секрет устройства. Не передавайте его посторонним.
          </p>
        </div>

        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
          <ImportForm onImport={onImportIdentity} />
        </div>
      </div>
    </div>
  );
}
