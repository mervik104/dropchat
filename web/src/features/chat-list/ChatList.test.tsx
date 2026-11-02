import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatList } from "./ChatList";

describe("ChatList", () => {
  it("renders a newly linked peer without a stored message list", () => {
    render(
      <ChatList
        peers={[
          {
            id: "peer-new",
            name: "New Peer",
            platform: "web",
            online: true,
            lastSeen: 1,
          },
        ]}
        messagesByPeer={{}}
        unreadByPeer={{}}
        currentDeviceId="device-a"
        onSelectPeer={vi.fn()}
      />,
    );

    expect(screen.getByText("New Peer")).toBeTruthy();
    expect(screen.getByText("Нет сообщений")).toBeTruthy();
  });

  it("shows unread counts and caps them at 99+", () => {
    render(
      <ChatList
        peers={[
          {
            id: "peer-a",
            name: "Alpha",
            platform: "web",
            online: true,
            lastSeen: 1,
          },
          {
            id: "peer-b",
            name: "Beta",
            platform: "web",
            online: false,
            lastSeen: 2,
          },
        ]}
        messagesByPeer={{}}
        unreadByPeer={{ "peer-a": 3, "peer-b": 100 }}
        currentDeviceId="device-a"
        onSelectPeer={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Alpha, 3 непрочитанных/ })
        .textContent,
    ).toContain("3");
    expect(
      screen.getByRole("button", { name: /Beta, 100 непрочитанных/ })
        .textContent,
    ).toContain("99+");
  });
});
