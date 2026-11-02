import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionBadge } from "./ConnectionBadge";

describe("ConnectionBadge", () => {
  it("shows a connection attempt while offline or connecting", () => {
    const { rerender } = render(<ConnectionBadge state="connecting" />);
    expect(screen.getByText("Соединение…")).toBeTruthy();

    rerender(<ConnectionBadge state="local" />);
    expect(screen.getByText("Соединение…")).toBeTruthy();
  });

  it("renders nothing when online", () => {
    const { container } = render(<ConnectionBadge state="online" />);
    expect(container.firstChild).toBeNull();
  });
});
