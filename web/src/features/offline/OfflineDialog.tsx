import { useEffect, useRef, useState, type FormEvent } from "react";

import { formatFileSize } from "../../lib/format";
import type {
  OfflineSession,
  OfflineSessionEvents,
} from "../../lib/offline-session";
import { copyText as copyTextToClipboard } from "../../platform/clipboard";
import { createBrowserOfflineSession } from "../../platform/offline-session";

type OfflineRole = "host" | "guest";
type OfflineStatus =
  | "idle"
  | "connecting"
  | "host-wait"
  | "guest-answer"
  | "connected"
  | "error"
  | "closed";

interface OfflineMessage {
  id: number;
  kind: "text" | "file";
  direction: "in" | "out";
  text?: string;
  fileName?: string;
  fileSize?: number;
}

const STATUS_LABEL: Record<OfflineStatus, string> = {
  idle: "",
  connecting: "Подключение…",
  "host-wait": "Ожидание ответа второго устройства",
  "guest-answer": "Ожидание первого устройства",
  connected: "Соединено",
  error: "Ошибка соединения",
  closed: "Соединение закрыто",
};

export interface OfflineDialogProps {
  onClose: () => void;
  createSession?: (events: OfflineSessionEvents) => OfflineSession;
  copyText?: (value: string) => Promise<void>;
}

export function OfflineDialog({
  onClose,
  createSession = createBrowserOfflineSession,
  copyText = copyTextToClipboard,
}: OfflineDialogProps) {
  const [role, setRole] = useState<OfflineRole | null>(null);
  const [status, setStatus] = useState<OfflineStatus>("idle");
  const [outgoingCode, setOutgoingCode] = useState("");
  const [incomingCode, setIncomingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<OfflineMessage[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const sessionRef = useRef<OfflineSession | null>(null);
  const idRef = useRef(0);

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
    };
  }, []);

  function addMessage(message: Omit<OfflineMessage, "id">): void {
    idRef.current += 1;
    setMessages((current) => [...current, { ...message, id: idRef.current }]);
  }

  function ensureSession(): OfflineSession {
    if (!sessionRef.current) {
      sessionRef.current = createSession({
        onOpen: () => setStatus("connected"),
        onText: (value) =>
          addMessage({ kind: "text", direction: "in", text: value }),
        onFile: (meta) =>
          addMessage({
            kind: "file",
            direction: "in",
            fileName: meta.name,
            fileSize: meta.size,
          }),
        onError: () => setStatus("error"),
        onClose: () => setStatus("closed"),
      });
    }
    return sessionRef.current;
  }

  function reset(): void {
    sessionRef.current?.close();
    sessionRef.current = null;
    setRole(null);
    setStatus("idle");
    setOutgoingCode("");
    setIncomingCode("");
    setBusy(false);
    setText("");
    setMessages([]);
    setProgress(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  async function startHost(): Promise<void> {
    setRole("host");
    setStatus("connecting");
    setBusy(true);
    try {
      const code = await ensureSession().createOfferCode();
      setOutgoingCode(code);
      setStatus("host-wait");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function joinAsGuest(event: FormEvent): Promise<void> {
    event.preventDefault();
    const code = incomingCode.trim();
    if (code.length === 0) {
      return;
    }

    setRole("guest");
    setStatus("connecting");
    setBusy(true);
    try {
      const answer = await ensureSession().joinWithOfferCode(code);
      setOutgoingCode(answer);
      setStatus("guest-answer");
      await ensureSession().waitForConnection();
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function finishHost(event: FormEvent): Promise<void> {
    event.preventDefault();
    const code = incomingCode.trim();
    if (code.length === 0) {
      return;
    }

    setStatus("connecting");
    setBusy(true);
    try {
      await ensureSession().acceptAnswerCode(code);
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await copyText(outgoingCode);
    } catch {
      // Clipboard access can be unavailable; the code is still selectable.
    }
  }

  async function sendMessage(event: FormEvent): Promise<void> {
    event.preventDefault();
    const value = text.trim();
    if (value.length === 0) {
      return;
    }

    try {
      await ensureSession().sendText(value);
      addMessage({ kind: "text", direction: "out", text: value });
      setText("");
    } catch {
      setStatus("error");
    }
  }

  async function sendFile(file: File): Promise<void> {
    setProgress(0);
    try {
      await ensureSession().sendFile(file, setProgress);
      addMessage({
        kind: "file",
        direction: "out",
        fileName: file.name,
        fileSize: file.size,
      });
    } catch {
      setStatus("error");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/50 px-4 py-6"
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900">
        <div className="flex items-center justify-between gap-4">
          <h2 id="offline-title" className="text-xl font-semibold">
            Офлайн-передача
          </h2>
          <button
            type="button"
            aria-label="Закрыть офлайн-передачу"
            onClick={handleClose}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
          >
            Закрыть
          </button>
        </div>

        {!role ? (
          <div className="mt-5">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Интернет не нужен. Устройства должны быть в одной Wi-Fi сети.
              Создайте код на одном устройстве и вставьте его на другом.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startHost()}
              className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              Создать код
            </button>

            <form onSubmit={joinAsGuest} className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
              <label
                htmlFor="offline-offer"
                className="text-sm font-medium"
              >
                Код приглашения другого устройства
              </label>
              <textarea
                id="offline-offer"
                aria-label="Код приглашения другого устройства"
                value={incomingCode}
                onChange={(event) => setIncomingCode(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-60 dark:border-stone-700"
              >
                Получить код
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-5">
            <p role="status" className="text-sm font-medium">
              {STATUS_LABEL[status]}
            </p>

            {outgoingCode && status !== "connected" ? (
              <div className="mt-4">
                <label htmlFor="offline-outgoing" className="text-sm font-medium">
                  Код для второго устройства
                </label>
                <textarea
                  id="offline-outgoing"
                  aria-label="Код для второго устройства"
                  readOnly
                  value={outgoingCode}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
                />
                <button
                  type="button"
                  aria-label="Копировать код"
                  onClick={() => void handleCopy()}
                  className="mt-2 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium dark:border-stone-700"
                >
                  Копировать
                </button>
              </div>
            ) : null}

            {role === "host" && status === "host-wait" ? (
              <form onSubmit={finishHost} className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                <label htmlFor="offline-answer" className="text-sm font-medium">
                  Вставьте код ответа
                </label>
                <textarea
                  id="offline-answer"
                  aria-label="Вставьте код ответа"
                  value={incomingCode}
                  onChange={(event) => setIncomingCode(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  Подключить
                </button>
              </form>
            ) : null}

            {role === "guest" && status === "guest-answer" ? (
              <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
                Передайте этот код первому устройству любым способом.
              </p>
            ) : null}

            {status === "connected" ? (
              <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
                <ul aria-label="Офлайн сообщения" className="max-h-48 space-y-2 overflow-y-auto">
                  {messages.map((message, index) => (
                    <li
                      key={`${message.id}-${index}`}
                      className={[
                        "rounded-xl px-3 py-2 text-sm",
                        message.direction === "out"
                          ? "bg-sky-600 text-white"
                          : "bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
                      ].join(" ")}
                    >
                      {message.kind === "text"
                        ? message.text
                        : `${message.fileName} · ${formatFileSize(message.fileSize!)}`}
                    </li>
                  ))}
                </ul>

                {progress !== null ? (
                  <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                    Передача файла: {progress}%
                  </p>
                ) : null}

                <form onSubmit={sendMessage} className="mt-3 flex items-center gap-2">
                  <input
                    aria-label="Офлайн сообщение"
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

                <label className="mt-3 inline-block cursor-pointer rounded-full border border-stone-300 px-3 py-2 text-sm dark:border-stone-700">
                  <span>Прикрепить файл</span>
                  <input
                    aria-label="Офлайн файл"
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        void sendFile(file);
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}

            {status === "error" ? (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
                Проверьте коды и попробуйте ещё раз.
              </p>
            ) : null}

            <button
              type="button"
              onClick={reset}
              className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium dark:border-stone-700"
            >
              Назад
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
