import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionBadge } from "./ConnectionBadge";

describe("ConnectionBadge", () => {
  it("shows connection and local-only states", () => {
    const { rerender } = render(<ConnectionBadge state="connecting" />);
    expect(screen.getByText("Подключение к серверу…")).toBeTruthy();

    rerender(<ConnectionBadge state="local" />);
    expect(screen.getByText("Только локально")).toBeTruthy();
  });

  it("renders nothing when online", () => {
    const { container } = render(<ConnectionBadge state="online" />);
    expect(container.firstChild).toBeNull();
  });
});
