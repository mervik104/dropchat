import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  OfflineSession,
  OfflineSessionEvents,
} from "../../lib/offline-session";
import { OfflineDialog } from "./OfflineDialog";

function fakeSession(overrides: Partial<OfflineSession> = {}) {
  return {
    createOfferCode: vi.fn(async () => "OFFER-CODE"),
    acceptAnswerCode: vi.fn(async () => undefined),
    joinWithOfferCode: vi.fn(async () => "ANSWER-CODE"),
    waitForConnection: vi.fn(async () => undefined),
    sendText: vi.fn(async () => undefined),
    sendFile: vi.fn(async (_file, onProgress) => {
      onProgress(100);
    }),
    close: vi.fn(),
    ...overrides,
  } satisfies OfflineSession;
}

function renderDialog(
  session: OfflineSession = fakeSession(),
  copyText = vi.fn(async () => undefined),
) {
  let events: OfflineSessionEvents | null = null;
  const createSession = vi.fn((next: OfflineSessionEvents) => {
    events = next;
    return session;
  });
  const onClose = vi.fn();
  const view = render(
    <OfflineDialog
      onClose={onClose}
      createSession={createSession}
      copyText={copyText}
    />,
  );
  return { ...view, session, createSession, onClose, copyText, events: () => events };
}

describe("OfflineDialog", () => {
  it("completes a host flow, sends text and a file, and receives items", async () => {
    const user = userEvent.setup();
    const sendFile = vi.fn(
      async (_file: File, onProgress: (percent: number) => void) => {
        onProgress(40);
      },
    );
    const session = fakeSession({ sendFile });
    const { copyText, events } = renderDialog(session);

    await user.click(screen.getByRole("button", { name: "Создать код" }));
    const code = await screen.findByLabelText("Код для второго устройства");
    expect((code as HTMLTextAreaElement).value).toBe("OFFER-CODE");
    expect(screen.getByText("Ожидание ответа второго устройства")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Копировать код" }));
    expect(copyText).toHaveBeenCalledWith("OFFER-CODE");

    await user.type(screen.getByLabelText("Вставьте код ответа"), "ANSWER");
    await user.click(screen.getByRole("button", { name: "Подключить" }));
    expect(session.acceptAnswerCode).toHaveBeenCalledWith("ANSWER");

    act(() => events()?.onOpen?.());
    expect(screen.getByText("Соединено")).toBeTruthy();

    await user.type(screen.getByLabelText("Офлайн сообщение"), "Привет");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    expect(session.sendText).toHaveBeenCalledWith("Привет");
    expect(screen.getByText("Привет")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Офлайн файл"), {
      target: {
        files: [new File(["abc"], "a.txt", { type: "text/plain" })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByText((_, node) => node?.textContent === "a.txt · 3 Б"),
      ).toBeTruthy(),
    );
    expect(sendFile).toHaveBeenCalledTimes(1);

    act(() => {
      events()?.onText?.("Ответ");
      events()?.onFile?.({ name: "b.txt", size: 4, mime: "text/plain" });
    });
    expect(screen.getByText("Ответ")).toBeTruthy();
    expect(
      screen
        .getAllByRole("listitem")
        .some((item) => item.textContent === "b.txt · 4 Б"),
    ).toBe(true);
  });

  it("completes a guest flow and shows the answer code", async () => {
    const user = userEvent.setup();
    const waitForConnection = vi.fn(() => new Promise<void>(() => undefined));
    const session = fakeSession({ waitForConnection });
    const { events } = renderDialog(session);

    await user.type(
      screen.getByLabelText("Код приглашения другого устройства"),
      "OFFER",
    );
    await user.click(screen.getByRole("button", { name: "Получить код" }));

    expect(session.joinWithOfferCode).toHaveBeenCalledWith("OFFER");
    const code = await screen.findByLabelText("Код для второго устройства");
    expect((code as HTMLTextAreaElement).value).toBe("ANSWER-CODE");
    expect(screen.getByText("Ожидание первого устройства")).toBeTruthy();

    act(() => events()?.onOpen?.());
    expect(screen.getByText("Соединено")).toBeTruthy();

    act(() => events()?.onError?.(new Error("signal")));
    expect(screen.getByText("Ошибка соединения")).toBeTruthy();

    act(() => events()?.onClose?.());
    expect(screen.getByText("Соединение закрыто")).toBeTruthy();
  });

  it("shows connecting state while creating an offer", async () => {
    const user = userEvent.setup();
    let resolveCode!: (code: string) => void;
    const session = fakeSession({
      createOfferCode: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveCode = resolve;
          }),
      ),
    });
    renderDialog(session);

    await user.click(screen.getByRole("button", { name: "Создать код" }));
    expect(screen.getByText("Подключение…")).toBeTruthy();

    await act(async () => {
      resolveCode("LATE");
    });
    expect(await screen.findByDisplayValue("LATE")).toBeTruthy();
  });

  it("handles failures in host, answer, guest, text, and file flows", async () => {
    const user = userEvent.setup();
    const session = fakeSession({
      createOfferCode: vi.fn(async () => {
        throw new Error("offer");
      }),
    });
    const first = renderDialog(session);

    await user.click(screen.getByRole("button", { name: "Создать код" }));
    expect(await screen.findByText("Ошибка соединения")).toBeTruthy();
    first.unmount();

    const answerSession = fakeSession({
      acceptAnswerCode: vi.fn(async () => {
        throw new Error("answer");
      }),
    });
    const host = renderDialog(answerSession);
    await user.click(screen.getByRole("button", { name: "Создать код" }));
    await user.type(screen.getByLabelText("Вставьте код ответа"), "ANSWER");
    await user.click(screen.getByRole("button", { name: "Подключить" }));
    expect(await screen.findByText("Ошибка соединения")).toBeTruthy();
    host.unmount();

    const guestSession = fakeSession({
      joinWithOfferCode: vi.fn(async () => {
        throw new Error("guest");
      }),
    });
    const guest = renderDialog(guestSession);
    await user.type(
      screen.getByLabelText("Код приглашения другого устройства"),
      "OFFER",
    );
    await user.click(screen.getByRole("button", { name: "Получить код" }));
    expect(await screen.findByText("Ошибка соединения")).toBeTruthy();
    guest.unmount();

    const connected = renderDialog(fakeSession());
    await user.click(screen.getByRole("button", { name: "Создать код" }));
    await user.type(screen.getByLabelText("Вставьте код ответа"), "ANSWER");
    await user.click(screen.getByRole("button", { name: "Подключить" }));
    act(() => connected.events()?.onOpen?.());
    (connected.session.sendText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("text"),
    );
    await user.type(screen.getByLabelText("Офлайн сообщение"), "x");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Ошибка соединения")).toBeTruthy();
    connected.unmount();

    const fileFailure = renderDialog(fakeSession());
    await user.click(screen.getByRole("button", { name: "Создать код" }));
    await user.type(screen.getByLabelText("Вставьте код ответа"), "ANSWER");
    await user.click(screen.getByRole("button", { name: "Подключить" }));
    act(() => fileFailure.events()?.onOpen?.());
    (fileFailure.session.sendFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("file"),
    );
    fireEvent.change(screen.getByLabelText("Офлайн файл"), {
      target: { files: [new File(["abc"], "a.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByText("Ошибка соединения")).toBeTruthy();
  });

  it("shows progress, ignores empty input, resets, and closes", async () => {
    const user = userEvent.setup();
    let finishFile!: () => void;
    const session = fakeSession({
      sendFile: vi.fn(
        (_file: File, onProgress: (percent: number) => void) =>
          new Promise<void>((resolve) => {
            onProgress(25);
            finishFile = resolve;
          }),
      ),
    });
    const { onClose, events } = renderDialog(
      session,
      vi.fn(async () => {
        throw new Error("copy");
      }),
    );

    await user.click(screen.getByRole("button", { name: "Создать код" }));
    await user.click(screen.getByRole("button", { name: "Копировать код" }));
    fireEvent.submit(
      screen.getByLabelText("Вставьте код ответа").closest("form")!,
    );
    expect(session.acceptAnswerCode).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Вставьте код ответа"), "ANSWER");
    await user.click(screen.getByRole("button", { name: "Подключить" }));
    act(() => events()?.onOpen?.());

    fireEvent.submit(screen.getByLabelText("Офлайн сообщение").closest("form")!);
    expect(session.sendText).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Офлайн файл"), {
      target: { files: [new File(["abc"], "a.txt", { type: "text/plain" })] },
    });
    expect(
      await screen.findByText((_, node) => node?.textContent === "Передача файла: 25%"),
    ).toBeTruthy();
    await act(async () => {
      finishFile();
    });
    expect(
      screen.queryByText((_, node) => node?.textContent === "Передача файла: 25%"),
    ).toBeNull();
    expect(
      screen
        .getAllByRole("listitem")
        .some((item) => item.textContent === "a.txt · 3 Б"),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Офлайн файл"), {
      target: { files: [] },
    });

    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(session.close).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Создать код" })).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Закрыть офлайн-передачу" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not submit an empty guest code", async () => {
    const user = userEvent.setup();
    const { session } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Получить код" }));
    expect(session.joinWithOfferCode).not.toHaveBeenCalled();
  });
});
