import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function Broken(): JSX.Element {
  throw new Error("render failed");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows a fallback instead of a blank screen and can reset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Что-то пошло не так")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Перезагрузить" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
