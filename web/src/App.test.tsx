import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { Workspace } from "./lib/workspace";

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

describe("DropChat messenger shell", () => {
  it("shows a loading state", () => {
    const loadWorkspace = vi.fn(
      () => new Promise<Workspace>(() => undefined),
    );

    render(<App loadWorkspace={loadWorkspace} />);

    expect(screen.getByText("Загрузка DropChat…")).toBeTruthy();
  });

  it("shows friendly empty states and the invite placeholder", async () => {
    render(<App loadWorkspace={async () => emptyWorkspace} />);

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
    render(<App loadWorkspace={async () => workspace} />);

    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText("Old Phone")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /PC/ }));

    expect(screen.getByRole("heading", { name: "PC" })).toBeTruthy();
    expect(screen.getByText("в сети")).toBeTruthy();
    expect(screen.getByText("Сообщений пока нет")).toBeTruthy();
    expect(screen.getAllByText("Авто").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByText("Выберите чат")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Old Phone/ }));
    expect(screen.getByRole("heading", { name: "Old Phone" })).toBeTruthy();
    expect(screen.getByText("не в сети")).toBeTruthy();
  });

  it("opens and closes device settings", async () => {
    const user = userEvent.setup();
    render(<App loadWorkspace={async () => workspace} />);

    await screen.findByText("MacBook");
    await user.click(screen.getByRole("button", { name: "Настройки" }));

    const dialog = screen.getByRole("dialog", { name: "Настройки" });
    expect(within(dialog).getByText("Мой Mac")).toBeTruthy();
    expect(within(dialog).getByText("web")).toBeTruthy();
    expect(within(dialog).getByText("как в системе")).toBeTruthy();

    await user.click(
      within(dialog).getByRole("button", { name: "Закрыть настройки" }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an error state and retries loading", async () => {
    const user = userEvent.setup();
    const loadWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(workspace);

    render(<App loadWorkspace={loadWorkspace} />);

    expect(await screen.findByText("Не удалось подключиться")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(loadWorkspace).toHaveBeenCalledTimes(2);
  });

  it("updates the screen after the loader resolves", async () => {
    let resolveWorkspace!: (value: Workspace) => void;
    const loadWorkspace = vi.fn(
      () =>
        new Promise<Workspace>((resolve) => {
          resolveWorkspace = resolve;
        }),
    );

    render(<App loadWorkspace={loadWorkspace} />);
    expect(screen.getByText("Загрузка DropChat…")).toBeTruthy();

    await act(async () => {
      resolveWorkspace(workspace);
    });

    expect(await screen.findByText("MacBook")).toBeTruthy();
  });
});
