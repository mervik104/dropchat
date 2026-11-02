import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    incomingRequests: [
      {
        id: "request-1",
        name: "Requester",
        platform: "web",
        online: true,
        lastSeen: 3,
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
  peers: { local: [], linked: [], incomingRequests: [] },
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
    sendText: vi.fn(async (_identity, _peerId, text, clientId) =>
      serverMessage({ id: clientId, text }),
    ),
    connectRealtime: vi.fn(async () => conn),
    refreshPeers: vi.fn(async () => workspace.peers),
    requestPeer: vi.fn(async (_identity, peerId) => ({
      id: peerId,
      name: "Peer",
      platform: "web",
      online: true,
      lastSeen: 1,
    })),
    respondPeer: vi.fn(async () => ({
      linked: true,
      peer: {
        id: "request-1",
        name: "Requester",
        platform: "web",
        online: true,
        lastSeen: 3,
      },
    })),
    createInvite: vi.fn(async () => ({ code: "123456", expiresAt: 300_000 })),
    redeemInvite: vi.fn(async () => ({
      id: "new-peer",
      name: "New Peer",
      platform: "web",
      online: true,
      lastSeen: 1,
    })),
    unlinkPeer: vi.fn(async () => undefined),
    blockPeer: vi.fn(async () => undefined),
    uploadFile: vi.fn(async (_identity, file: File) =>
      serverMessage({
        id: "upload-1",
        kind: "file",
        text: null,
        fileId: "file-1",
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        transport: "cloud",
      }),
    ),
    downloadFile: vi.fn(async () => ({ url: "https://download.example/file" })),
    openUrl: vi.fn(),
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
    ).toBe(false);
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
      invisible: false,
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
      "local-1",
    );

    await act(async () => {
      resolveSend(
        serverMessage({
          id: "local-1",
          text: "Новое сообщение",
          createdAt: 5,
        }),
      );
    });

    expect(screen.queryByText("Отправка…")).toBeNull();
    expect(screen.getByText("Новое сообщение")).toBeTruthy();
  });

  it("marks a failed send and retries with the same client id", async () => {
    const user = userEvent.setup();
    const sendText = vi
      .fn()
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValueOnce(serverMessage({ id: "local-1", text: "Дойдёт" }));
    renderApp(async () => workspace, { sendText });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");
    await user.type(screen.getByLabelText("Сообщение"), "Дойдёт");
    await user.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText("Ошибка отправки")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(screen.queryByText("Ошибка отправки")).toBeNull());
    expect(sendText).toHaveBeenLastCalledWith(
      workspace.identity,
      "peer-online",
      "Дойдёт",
      "local-1",
    );
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


  it("refreshes presence and missed messages after reconnect", async () => {
    const user = userEvent.setup();
    let onReconnect: (() => void) | null = null;
    const connectRealtime = vi.fn(
      async (
        _identity,
        _handler: (event: WsEvent) => void,
        reconnect: () => void,
      ) => {
        onReconnect = reconnect;
        return { close: vi.fn() };
      },
    );
    const refreshPeers = vi.fn(async () => ({
      ...workspace.peers,
      linked: workspace.peers.linked.map((peer) =>
        peer.id === "peer-online" ? { ...peer, online: false } : peer,
      ),
    }));
    const loadMessages = vi
      .fn()
      .mockResolvedValueOnce({ messages: [], nextBefore: null })
      .mockResolvedValueOnce({
        messages: [
          serverMessage({
            id: "missed-1",
            fromDevice: "peer-online",
            toDevice: "device-a-00000001",
            text: "Пропущено",
            createdAt: 5,
          }),
        ],
        nextBefore: null,
      });
    renderApp(async () => workspace, {
      connectRealtime,
      refreshPeers,
      loadMessages,
    });

    await screen.findByText("MacBook");
    await waitFor(() => expect(onReconnect).not.toBeNull());
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");

    await act(async () => {
      onReconnect?.();
    });

    expect(await screen.findByText("Пропущено")).toBeTruthy();
    expect(await screen.findByText("не в сети")).toBeTruthy();
    expect(refreshPeers).toHaveBeenCalledWith(workspace.identity);
    expect(loadMessages).toHaveBeenLastCalledWith(
      workspace.identity,
      "peer-online",
    );
  });

  it("refreshes presence after reconnect even without an open chat", async () => {
    let onReconnect: (() => void) | null = null;
    const connectRealtime = vi.fn(
      async (
        _identity,
        _handler: (event: WsEvent) => void,
        reconnect: () => void,
      ) => {
        onReconnect = reconnect;
        return { close: vi.fn() };
      },
    );
    const refreshPeers = vi.fn(async () => workspace.peers);
    renderApp(async () => workspace, { connectRealtime, refreshPeers });

    await screen.findByText("MacBook");
    await waitFor(() => expect(onReconnect).not.toBeNull());

    await act(async () => {
      onReconnect?.();
    });

    expect(refreshPeers).toHaveBeenCalledWith(workspace.identity);
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


  it("sends a contact request to a nearby device", async () => {
    const user = userEvent.setup();
    const requestPeer = vi.fn(async (_identity, peerId) => ({
      id: peerId,
      name: "MacBook",
      platform: "web",
      online: true,
      lastSeen: 1,
    }));
    renderApp(async () => workspace, { requestPeer });

    await screen.findByText("MacBook");
    await user.click(
      screen.getByRole("button", { name: "Отправить запрос MacBook" }),
    );

    expect(requestPeer).toHaveBeenCalledWith(workspace.identity, "local-online");
    expect(await screen.findByText("Отправлено")).toBeTruthy();
  });

  it("accepts an incoming request and refreshes chats", async () => {
    const user = userEvent.setup();
    const respondPeer = vi.fn(async () => ({
      linked: true,
      peer: {
        id: "request-1",
        name: "Requester",
        platform: "web",
        online: true,
        lastSeen: 3,
      },
    }));
    const refreshPeers = vi.fn(async () => ({
      ...workspace.peers,
      incomingRequests: [],
      linked: [
        ...workspace.peers.linked,
        {
          id: "request-1",
          name: "Requester",
          platform: "web",
          online: true,
          lastSeen: 3,
        },
      ],
    }));
    renderApp(async () => workspace, { respondPeer, refreshPeers });

    await screen.findByText("Requester");
    await user.click(screen.getByRole("button", { name: "Принять" }));

    expect(respondPeer).toHaveBeenCalledWith(
      workspace.identity,
      "request-1",
      true,
    );
    expect(refreshPeers).toHaveBeenCalledWith(workspace.identity);
    expect(
      await screen.findByRole("button", { name: /Requester/ }),
    ).toBeTruthy();
  });

  it("creates and redeems an invite code", async () => {
    const user = userEvent.setup();
    const createInvite = vi.fn(async () => ({
      code: "123456",
      expiresAt: 300_000,
    }));
    const redeemInvite = vi.fn(async () => ({
      id: "new-peer",
      name: "New Peer",
      platform: "web",
      online: true,
      lastSeen: 1,
    }));
    const refreshPeers = vi.fn(async () => workspace.peers);
    renderApp(async () => workspace, {
      createInvite,
      redeemInvite,
      refreshPeers,
    });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Код приглашения" }));

    const dialog = screen.getByRole("dialog", { name: "Код приглашения" });
    await user.click(within(dialog).getByRole("button", { name: "Создать код" }));
    expect(await within(dialog).findByText("Код: 123456")).toBeTruthy();
    expect(createInvite).toHaveBeenCalledWith(workspace.identity);

    await user.type(within(dialog).getByLabelText("Введите код"), "654321");
    await user.click(within(dialog).getByRole("button", { name: "Применить" }));

    expect(redeemInvite).toHaveBeenCalledWith(workspace.identity, "654321");
    expect(refreshPeers).toHaveBeenCalledWith(workspace.identity);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saves invisible mode from settings", async () => {
    const user = userEvent.setup();
    const saveProfile = vi.fn(async (identity: DeviceIdentity, patch: UpdateDeviceRequest) =>
      profileFor(identity, patch),
    );
    renderApp(async () => workspace, { saveProfile });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Настройки" }));
    await user.click(screen.getByLabelText("Невидимый режим"));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(saveProfile).toHaveBeenCalledWith(workspace.identity, {
      name: "Мой Mac",
      invisible: true,
    });
  });

  it("refreshes peers on peer request and peer linked events", async () => {
    let onEvent: ((event: WsEvent) => void) | null = null;
    const connectRealtime = vi.fn(async (_identity, handler: (event: WsEvent) => void) => {
      onEvent = handler;
      return { close: vi.fn() };
    });
    const refreshPeers = vi.fn(async () => workspace.peers);
    renderApp(async () => workspace, { connectRealtime, refreshPeers });

    await screen.findByText("MacBook");
    await waitFor(() => expect(onEvent).not.toBeNull());

    act(() => {
      onEvent?.({ type: "peer.request", from: workspace.peers.incomingRequests[0]! });
      onEvent?.({ type: "peer.linked", peer: workspace.peers.linked[0]! });
    });

    await waitFor(() => expect(refreshPeers).toHaveBeenCalledTimes(2));
  });


  it("handles a failed contact request", async () => {
    const user = userEvent.setup();
    const requestPeer = vi.fn(async () => {
      throw new Error("request failed");
    });
    renderApp(async () => workspace, { requestPeer });

    await screen.findByText("MacBook");
    await user.click(
      screen.getByRole("button", { name: "Отправить запрос MacBook" }),
    );

    await waitFor(() => expect(screen.queryByText("Отправлено")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Отправить запрос MacBook" }),
    ).toBeTruthy();
  });

  it("declines an incoming request", async () => {
    const user = userEvent.setup();
    const respondPeer = vi.fn(async () => ({ linked: false }));
    const refreshPeers = vi.fn(async () => workspace.peers);
    renderApp(async () => workspace, { respondPeer, refreshPeers });

    await screen.findByText("Requester");
    await user.click(screen.getByRole("button", { name: "Отклонить" }));

    expect(respondPeer).toHaveBeenCalledWith(
      workspace.identity,
      "request-1",
      false,
    );
    await waitFor(() => expect(refreshPeers).toHaveBeenCalled());
  });

  it("shows invite creation and redemption errors", async () => {
    const user = userEvent.setup();
    const createInvite = vi.fn(async () => {
      throw new Error("create failed");
    });
    const redeemInvite = vi.fn(async () => {
      throw new Error("redeem failed");
    });
    renderApp(async () => workspace, { createInvite, redeemInvite });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Код приглашения" }));
    const dialog = screen.getByRole("dialog", { name: "Код приглашения" });

    await user.click(within(dialog).getByRole("button", { name: "Создать код" }));
    expect(await within(dialog).findByText("Не удалось создать код")).toBeTruthy();

    await user.type(within(dialog).getByLabelText("Введите код"), "654321");
    await user.click(within(dialog).getByRole("button", { name: "Применить" }));
    expect(await within(dialog).findByText("Не удалось применить код")).toBeTruthy();
  });

  it("ignores peer event refresh failures", async () => {
    let onEvent: ((event: WsEvent) => void) | null = null;
    const connectRealtime = vi.fn(async (_identity, handler: (event: WsEvent) => void) => {
      onEvent = handler;
      return { close: vi.fn() };
    });
    const refreshPeers = vi.fn(async () => {
      throw new Error("refresh failed");
    });
    renderApp(async () => workspace, { connectRealtime, refreshPeers });

    await screen.findByText("MacBook");
    await waitFor(() => expect(onEvent).not.toBeNull());

    act(() => {
      onEvent?.({ type: "peer.request", from: workspace.peers.incomingRequests[0]! });
      onEvent?.({ type: "peer.linked", peer: workspace.peers.linked[0]! });
    });

    await waitFor(() => expect(refreshPeers).toHaveBeenCalledTimes(2));
  });


  it("unlinks and blocks from the chat menu", async () => {
    const user = userEvent.setup();
    const unlinkPeer = vi.fn(async () => undefined);
    const blockPeer = vi.fn(async () => undefined);
    const refreshPeers = vi.fn(async () => workspace.peers);
    renderApp(async () => workspace, {
      unlinkPeer,
      blockPeer,
      refreshPeers,
    });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");
    await user.click(screen.getByRole("button", { name: "Действия с чатом" }));
    await user.click(screen.getByRole("button", { name: "Отвязать устройство" }));

    expect(unlinkPeer).toHaveBeenCalledWith(workspace.identity, "peer-online");
    expect(refreshPeers).toHaveBeenCalledWith(workspace.identity);
    expect(screen.getByText("Выберите чат")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Old Phone/ }));
    await screen.findByText("Сообщений пока нет");
    await user.click(screen.getByRole("button", { name: "Действия с чатом" }));
    await user.click(screen.getByRole("button", { name: "Заблокировать устройство" }));

    expect(blockPeer).toHaveBeenCalledWith(workspace.identity, "peer-offline");
  });

  it("shows and dismisses a peer linked notification", async () => {
    const user = userEvent.setup();
    let onEvent: ((event: WsEvent) => void) | null = null;
    const connectRealtime = vi.fn(async (_identity, handler: (event: WsEvent) => void) => {
      onEvent = handler;
      return { close: vi.fn() };
    });
    renderApp(async () => workspace, { connectRealtime });

    await screen.findByText("MacBook");
    await waitFor(() => expect(onEvent).not.toBeNull());

    act(() => {
      onEvent?.({ type: "peer.linked", peer: workspace.peers.linked[0]! });
    });

    expect(
      await screen.findByText("Устройство PC подключилось"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Скрыть уведомление" }));
    expect(screen.queryByText("Устройство PC подключилось")).toBeNull();
  });


  it("uploads a file with progress and renders the file bubble", async () => {
    const user = userEvent.setup();
    let resolveUpload!: (message: ChatMessage) => void;
    let progressCallback!: (percent: number) => void;
    const uploadFile = vi.fn(
      (_identity, file: File, _peerId, onProgress, _signal) => {
        progressCallback = onProgress;
        return new Promise<ChatMessage>((resolve) => {
          resolveUpload = resolve;
          void file;
        });
      },
    );
    renderApp(async () => workspace, { uploadFile });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");

    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Прикрепить файл"), file);

    act(() => progressCallback(50));
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "SPAN" &&
          element.textContent?.includes("50%") === true,
      ),
    ).toBeTruthy();

    await act(async () => {
      resolveUpload(
        serverMessage({
          id: "upload-1",
          kind: "file",
          text: null,
          fileId: "file-1",
          fileName: "hello.txt",
          fileSize: 5,
          mime: "text/plain",
          transport: "cloud",
          expiresAt: 10_000,
        }),
      );
    });

    expect(screen.getByText("hello.txt")).toBeTruthy();
    expect(screen.getByText("хранится 30 дней")).toBeTruthy();
    expect(uploadFile).toHaveBeenCalledWith(
      workspace.identity,
      file,
      "peer-online",
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it("cancels an active upload", async () => {
    const user = userEvent.setup();
    let aborted = false;
    const uploadFile = vi.fn(
      (_identity, _file, _peerId, _onProgress, signal: AbortSignal) =>
        new Promise<ChatMessage>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    renderApp(async () => workspace, { uploadFile });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("Сообщений пока нет");
    await user.upload(
      screen.getByLabelText("Прикрепить файл"),
      new File(["hello"], "hello.txt", { type: "text/plain" }),
    );

    await user.click(screen.getByRole("button", { name: "Отменить загрузку" }));
    expect(aborted).toBe(true);
  });

  it("downloads file messages through a signed link", async () => {
    const user = userEvent.setup();
    const downloadFile = vi.fn(async () => ({
      url: "https://download.example/file",
    }));
    const openUrl = vi.fn();
    const loadMessages = vi.fn(async () => ({
      messages: [
        serverMessage({
          id: "file-msg",
          kind: "file",
          text: null,
          fileId: "file-1",
          fileName: "report.txt",
          fileSize: 10,
          mime: "text/plain",
          transport: "cloud",
          expiresAt: 10_000,
        }),
      ],
      nextBefore: null,
    }));
    renderApp(async () => workspace, { downloadFile, openUrl, loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("report.txt");
    await user.click(screen.getByRole("button", { name: "Скачать" }));

    expect(downloadFile).toHaveBeenCalledWith(workspace.identity, "file-1");
    expect(openUrl).toHaveBeenCalledWith("https://download.example/file");
  });

  it("shows expired files without a download action", async () => {
    const user = userEvent.setup();
    const loadMessages = vi.fn(async () => ({
      messages: [
        serverMessage({
          id: "old-file",
          kind: "file",
          text: null,
          fileId: "file-old",
          fileName: "old.txt",
          fileSize: 1,
          mime: "text/plain",
          transport: "cloud",
          expiresAt: 500,
        }),
      ],
      nextBefore: null,
    }));
    renderApp(async () => workspace, { loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));

    expect(await screen.findByText("истёк")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Скачать" })).toBeNull();
  });


  it("shows an upload error and a download error", async () => {
    const user = userEvent.setup();
    const uploadFile = vi.fn(async () => {
      throw new Error("upload failed");
    });
    const downloadFile = vi.fn(async () => {
      throw new Error("download failed");
    });
    const loadMessages = vi.fn(async () => ({
      messages: [
        serverMessage({
          id: "file-msg",
          kind: "file",
          text: null,
          fileId: "file-1",
          fileName: "report.txt",
          fileSize: 10,
          mime: "text/plain",
          transport: "cloud",
          expiresAt: 10_000,
        }),
      ],
      nextBefore: null,
    }));
    renderApp(async () => workspace, { uploadFile, downloadFile, loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    await screen.findByText("report.txt");
    await user.click(screen.getByRole("button", { name: "Скачать" }));
    expect(await screen.findByText("Не удалось скачать файл")).toBeTruthy();

    await user.upload(
      screen.getByLabelText("Прикрепить файл"),
      new File(["hello"], "hello.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText("Не удалось отправить файл")).toBeTruthy();
  });

  it("ignores file inputs without a file and formats file sizes", async () => {
    const user = userEvent.setup();
    const uploadFile = vi.fn();
    const loadMessages = vi.fn(async () => ({
      messages: [
        serverMessage({
          id: "small",
          kind: "file",
          text: null,
          fileId: "file-small",
          fileName: "small.bin",
          fileSize: 5,
          mime: "text/plain",
          transport: null,
          fromDevice: "peer-online",
          toDevice: "device-a-00000001",
          expiresAt: 10_000,
        }),
        serverMessage({
          id: "kilo",
          kind: "file",
          text: null,
          fileId: "file-kilo",
          fileName: "kilo.bin",
          fileSize: 2048,
          mime: "text/plain",
          transport: null,
          fromDevice: "peer-online",
          toDevice: "device-a-00000001",
          expiresAt: 10_000,
        }),
        serverMessage({
          id: "mega",
          kind: "file",
          text: null,
          fileId: "file-mega",
          fileName: "mega.bin",
          fileSize: 2 * 1024 * 1024,
          mime: "text/plain",
          transport: null,
          fromDevice: "peer-online",
          toDevice: "device-a-00000001",
          expiresAt: 10_000,
        }),
      ],
      nextBefore: null,
    }));
    renderApp(async () => workspace, { uploadFile, loadMessages });

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: /PC/ }));
    expect(await screen.findByText("5 Б")).toBeTruthy();
    expect(screen.getByText("2 КБ")).toBeTruthy();
    expect(screen.getByText("2.0 МБ")).toBeTruthy();
    expect(screen.queryByText("хранится 30 дней")).toBeNull();

    fireEvent.change(screen.getByLabelText("Прикрепить файл"), {
      target: { files: [] },
    });
    expect(uploadFile).not.toHaveBeenCalled();
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
