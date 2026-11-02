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
        currentDeviceId="device-a"
        onSelectPeer={vi.fn()}
      />,
    );

    expect(screen.getByText("New Peer")).toBeTruthy();
    expect(screen.getByText("Нет сообщений")).toBeTruthy();
  });
});
