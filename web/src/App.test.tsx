import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  ChatMessage,
  DeviceProfile,
  UpdateDeviceRequest,
  WsEvent,
} from "@dropchat/shared";

import { App, type AppProps } from "./App";
import { serializeIdentity, type DeviceIdentity } from "./lib/identity";
import {
  IdentityRejectedError,
  RegistrationRateLimitedError,
  type Workspace,
} from "./lib/workspace";

const workspace: Workspace = {
  identity: {
    deviceId: "device-a-00000001",
    secret: "s".repeat(43),
    name: "Мой Mac",
    platform: "web",
  },
  peers: {
    local: [
      {
        id: "local-online",
        name: "MacBook",
        platform: "web",
        online: true,
        lastSeen: 1,
      },
      {
        id: "local-offline",
        name: "Phone",
        platform: "web",
        online: false,
        lastSeen: 0,
      },
    ],
    linked: [
      {
        id: "peer-online",
        name: "PC",
        platform: "web",
        online: true,
        lastSeen: 2,
      },
      {
        id: "peer-offline",
        name: "Old Phone",
        platform: "web",
        online: false,
        lastSeen: 0,
      },
    ],
  },
};

const emptyWorkspace: Workspace = {
  ...workspace,
  peers: { local: [], linked: [] },
};

function profileFor(identity: DeviceIdentity, patch: UpdateDeviceRequest): DeviceProfile {
  return {
    id: identity.deviceId,
    name: patch.name ?? identity.name,
    platform: identity.platform,
    invisible: patch.invisible ?? false,
    lastSeen: 2,
    createdAt: 0,
  };
}

function serverMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    chatKey: "device-a-00000001:peer-online",
    fromDevice: "device-a-00000001",
    toDevice: "peer-online",
    kind: "text",
    text: "Привет",
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: null,
    status: "sent",
    createdAt: 1,
    expiresAt: 2,
    ...overrides,
  };
}

function renderApp(
  loadWorkspace: AppProps["loadWorkspace"],
  overrides: Partial<Omit<AppProps, "loadWorkspace">> = {},
) {
  const conn = { close: vi.fn() };
  const props: AppProps = {
    loadWorkspace,
    saveProfile: vi.fn(async (identity, patch) => profileFor(identity, patch)),
    resetIdentity: vi.fn(async () => undefined),
    importIdentity: vi.fn(async () => undefined),
    loadMessages: vi.fn(async () => ({ messages: [], nextBefore: null })),
    sendText: vi.fn(async (_identity, _peerId, text) => serverMessage({ text })),
    connectRealtime: vi.fn(async () => conn),
    createLocalId: () => "local-1",
    now: () => 1_000,
    ...overrides,
  };

  const view = render(<App {...props} />);
  return { ...props, conn, unmount: view.unmount };
}

describe("DropChat messenger shell", () => {
  it("shows a loading state", () => {
    renderApp(() => new Promise<Workspace>(() => undefined));

    expect(screen.getByText("Загрузка DropChat…")).toBeTruthy();
  });

  it("shows friendly empty states and the invite placeholder", async () => {
    renderApp(async () => emptyWorkspace);

    expect(await screen.findByRole("heading", { name: "DropChat" })).toBeTruthy();
    expect(screen.getByText("Мой Mac")).toBeTruthy();
    expect(screen.getByText("Рядом пока никого")).toBeTruthy();
    expect(screen.getByText("Пока нет чатов")).toBeTruthy();
    expect(screen.getByText("Выберите чат")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Код приглашения" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows nearby devices and lets the user open a linked chat", async () => {
    const user = userEvent.setup();
    renderApp(async () => workspace);

    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText("Old Phone")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /PC/ }));

    expect(screen.getByRole("heading", { name: "PC" })).toBeTruthy();
    expect(screen.getByText("в сети")).toBeTruthy();
    expect(await screen.findByText("Сообщений пока нет")).toBeTruthy();
    expect(screen.getAllByText("Авто").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByText("Выберите чат")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Old Phone/ }));
    expect(screen.getByRole("heading", { name: "Old Phone" })).toBeTruthy();
    expect(screen.getByText("не в сети")).toBeTruthy();
  });

  it("opens settings, saves the device name, and closes", async () => {
    const user = userEvent.setup();
    const saveProfile = vi.fn(async (identity: DeviceIdentity, patch: UpdateDeviceRequest) =>
      profileFor(identity, patch),
    );
    renderApp(async () => workspace, { saveProfile });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Настройки" }));

    const dialog = screen.getByRole("dialog", { name: "Настройки" });
    const input = within(dialog).getByLabelText("Имя устройства");
    await user.clear(input);
    await user.type(input, "New Mac");
    await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    expect(saveProfile).toHaveBeenCalledWith(workspace.identity, {
      name: "New Mac",
    });
    expect(await screen.findByText("New Mac")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps settings open when saving the name fails", async () => {
    const user = userEvent.setup();
    const saveProfile = vi.fn(async () => {
      throw new Error("save failed");
    });
    renderApp(async () => workspace, { saveProfile });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Настройки" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Не удалось сохранить имя")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Настройки" })).toBeTruthy();
    expect(
      within(screen.getByRole("dialog")).getByText("как в системе"),
    ).toBeTruthy();
  });

  it("shows the identity export and imports identity from settings", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi.fn(async () => workspace);
    const importIdentity = vi.fn(async () => undefined);
    renderApp(loadWorkspace, { importIdentity });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Настройки" }));

    const exportField = screen.getByLabelText("Экспорт identity") as HTMLTextAreaElement;
    expect(exportField.value).toBe(serializeIdentity(workspace.identity));
    expect(exportField.readOnly).toBe(true);

    const importField = screen.getByLabelText("Импорт identity");
    await user.type(importField, "saved identity");
    await user.click(screen.getByRole("button", { name: "Импортировать" }));

    expect(importIdentity).toHaveBeenCalledWith("saved identity");
    expect(loadWorkspace).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an error and retries", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(workspace);
    renderApp(loadWorkspace);

    expect(await screen.findByText("Не удалось подключиться")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(loadWorkspace).toHaveBeenCalledTimes(2);
  });

  it("explains a rejected identity server-side and allows reset", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new IdentityRejectedError())
      .mockResolvedValueOnce(workspace);
    const resetIdentity = vi.fn(async () => undefined);
    renderApp(loadWorkspace, { resetIdentity });

    expect(await screen.findByText("Сервер не узнал устройство")).toBeTruthy();
    expect(
      screen.getByText("Локальная identity сохранена. Импортируйте её или сбросьте."),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Сбросить identity" }));

    expect(resetIdentity).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("MacBook")).toBeTruthy();
  });

  it("imports an identity from the error screen and retries", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new IdentityRejectedError())
      .mockResolvedValueOnce(workspace);
    const importIdentity = vi.fn(async () => undefined);
    renderApp(loadWorkspace, { importIdentity });

    expect(await screen.findByText("Сервер не узнал устройство")).toBeTruthy();
    await user.type(screen.getByLabelText("Импорт identity"), "backup");
    await user.click(screen.getByRole("button", { name: "Импортировать" }));

    expect(importIdentity).toHaveBeenCalledWith("backup");
    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(loadWorkspace).toHaveBeenCalledTimes(2);
  });


  it("shows an import error without retrying", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi.fn().mockRejectedValueOnce(new IdentityRejectedError());
    const importIdentity = vi.fn(async () => {
      throw new Error("bad identity");
    });
    renderApp(loadWorkspace, { importIdentity });

    expect(await screen.findByText("Сервер не узнал устройство")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Импортировать" }));

    expect(await screen.findByText("Не удалось импортировать identity")).toBeTruthy();
    expect(loadWorkspace).toHaveBeenCalledTimes(1);
  });

  it("handles registration rate limiting separately", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new RegistrationRateLimitedError())
      .mockResolvedValueOnce(workspace);
    renderApp(loadWorkspace);

    expect(
      await screen.findByText("Слишком много попыток регистрации"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Сбросить identity" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("MacBook")).toBeTruthy();
  });


  it("loads messages and paginates older pages", async () => {
    const user = userEvent.setup();
    const loadMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [serverMessage({ id: "msg-2", text: "two", createdAt: 2 })],
        nextBefore: "msg-2",
      })
      .mockResolvedValueOnce({
        messages: [serverMessage({ id: "msg-1", text: "one", createdAt: 1 })],
        nextBefore: null,
      });
    renderApp(async () => workspace, { loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    expect(await screen.findByText("two")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Загрузить ещё" }));

    expect(await screen.findByText("one")).toBeTruthy();
    expect(loadMessages).toHaveBeenNthCalledWith(
      2,
      workspace.identity,
      "peer-online",
      "msg-2",
    );
    expect(screen.queryByRole("button", { name: "Загрузить ещё" })).toBeNull();
  });

  it("shows a message loading state and load errors", async () => {
    const user = userEvent.setup();
    let rejectMessages!: (error: Error) => void;
    const loadMessages = vi.fn(
      () =>
        new Promise<{ messages: ChatMessage[]; nextBefore: string | null }>(
          (_resolve, reject) => {
            rejectMessages = reject;
          },
        ),
    );
    renderApp(async () => workspace, { loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    expect(screen.getByText("Загрузка сообщений…")).toBeTruthy();

    await act(async () => {
      rejectMessages(new Error("load failed"));
    });

    expect(await screen.findByText("Не удалось загрузить сообщения")).toBeTruthy();
  });

  it("sends optimistically and replaces the message on success", async () => {
    const user = userEvent.setup();
    let resolveSend!: (message: ChatMessage) => void;
    const sendText = vi.fn(
      () =>
        new Promise<ChatMessage>((resolve) => {
          resolveSend = resolve;
        }),
    );
    renderApp(async () => workspace, { sendText });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");

    await user.click(screen.getByRole("button", { name: "Отправить" }));
    expect(sendText).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Сообщение"), "Новое сообщение");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    expect(screen.getByText("Новое сообщение")).toBeTruthy();
    expect(screen.getByText("Отправка…")).toBeTruthy();
    expect(sendText).toHaveBeenCalledWith(
      workspace.identity,
      "peer-online",
      "Новое сообщение",
    );

    await act(async () => {
      resolveSend(
        serverMessage({
          id: "saved-1",
          text: "Новое сообщение",
          createdAt: 5,
        }),
      );
    });

    expect(screen.queryByText("Отправка…")).toBeNull();
    expect(screen.getByText("Новое сообщение")).toBeTruthy();
  });

  it("marks a failed send", async () => {
    const user = userEvent.setup();
    const sendText = vi.fn(async () => {
      throw new Error("send failed");
    });
    renderApp(async () => workspace, { sendText });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");
    await user.type(screen.getByLabelText("Сообщение"), "Не уйдёт");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText("Ошибка отправки")).toBeTruthy();
  });

  it("applies incoming messages and presence events", async () => {
    const user = userEvent.setup();
    let onEvent: ((event: WsEvent) => void) | null = null;
    const connectRealtime = vi.fn(async (_identity, handler: (event: WsEvent) => void) => {
      onEvent = handler;
      return { close: vi.fn() };
    });
    renderApp(async () => workspace, { connectRealtime });

    await screen.findByText("MacBook");
    await waitFor(() => expect(onEvent).not.toBeNull());
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");

    act(() => {
      onEvent?.({
        type: "message.new",
        message: serverMessage({
          id: "incoming-1",
          fromDevice: "peer-online",
          toDevice: "device-a-00000001",
          text: "С сервера",
          createdAt: 4,
        }),
      });
      onEvent?.({
        type: "message.new",
        message: serverMessage({
          id: "incoming-2",
          toDevice: "peer-offline",
          text: "Другому",
          createdAt: 4,
        }),
      });
      onEvent?.({ type: "presence", deviceId: "peer-online", online: false });
    });

    expect(await screen.findByText("С сервера")).toBeTruthy();
    expect(await screen.findByText("не в сети")).toBeTruthy();
  });


  it("survives a failed realtime connection", async () => {
    const connectRealtime = vi.fn(async () => {
      throw new Error("socket failed");
    });
    renderApp(async () => workspace, { connectRealtime });

    expect(await screen.findByText("MacBook")).toBeTruthy();
    await waitFor(() => expect(connectRealtime).toHaveBeenCalled());
  });

  it("shows an error when loading older messages fails", async () => {
    const user = userEvent.setup();
    const loadMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [serverMessage({ id: "msg-2", text: "two", createdAt: 2 })],
        nextBefore: "msg-2",
      })
      .mockRejectedValueOnce(new Error("older failed"));
    renderApp(async () => workspace, { loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("two");
    await user.click(screen.getByRole("button", { name: "Загрузить ещё" }));

    expect(await screen.findByText("Не удалось загрузить сообщения")).toBeTruthy();
  });

  it("closes the realtime connection on unmount", async () => {
    const close = vi.fn();
    const connectRealtime = vi.fn(async () => ({ close }));
    const { unmount } = renderApp(async () => workspace, { connectRealtime });

    await screen.findByText("MacBook");
    await waitFor(() => expect(connectRealtime).toHaveBeenCalled());
    await act(async () => undefined);

    unmount();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("updates the screen after the loader resolves", async () => {
    let resolveWorkspace!: (value: Workspace) => void;
    const loadWorkspace = vi.fn(
      () =>
        new Promise<Workspace>((resolve) => {
          resolveWorkspace = resolve;
        }),
    );

    renderApp(loadWorkspace);
    expect(screen.getByText("Загрузка DropChat…")).toBeTruthy();

    await act(async () => {
      resolveWorkspace(workspace);
    });

    expect(await screen.findByText("MacBook")).toBeTruthy();
  });
});
