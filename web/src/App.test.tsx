import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("DropChat shell", () => {
  it("shows the title and the online backend status", async () => {
    const check = vi.fn().mockResolvedValue(true);

    render(<App healthClient={{ check }} />);

    expect(screen.getByRole("heading", { name: "DropChat" })).toBeTruthy();
    expect(screen.getByText("Проверка сервера...")).toBeTruthy();
    expect(await screen.findByText("Сервер доступен")).toBeTruthy();
  });

  it("shows the offline backend status", async () => {
    const check = vi.fn().mockResolvedValue(false);

    render(<App healthClient={{ check }} />);

    expect(await screen.findByText("Сервер недоступен")).toBeTruthy();
  });
});
