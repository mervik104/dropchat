import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "./Composer";

describe("Composer", () => {
  it("sends on Enter, ignores empty and Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => undefined);
    render(<Composer onSend={onSend} onAttach={vi.fn()} />);

    const input = screen.getByLabelText("Сообщение");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();

    await user.type(input, "Текст");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("Текст");
  });

  it("keeps Enter as a newline on touch devices", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => undefined);
    const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: matchMedia,
    });
    render(<Composer onSend={onSend} onAttach={vi.fn()} />);

    await user.type(screen.getByLabelText("Сообщение"), "Текст");
    fireEvent.keyDown(screen.getByLabelText("Сообщение"), { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
  });

  it("shows a drop overlay and attaches dropped files", () => {
    const onAttach = vi.fn();
    const { container } = render(
      <Composer onSend={vi.fn(async () => undefined)} onAttach={onAttach} />,
    );
    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    fireEvent.dragOver(form!);
    expect(screen.getByText("Отпустите, чтобы отправить")).toBeTruthy();

    fireEvent.dragLeave(form!);
    expect(screen.queryByText("Отпустите, чтобы отправить")).toBeNull();

    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    fireEvent.drop(form!, { dataTransfer: { files: [file] } });
    expect(onAttach).toHaveBeenCalledWith([file]);

    fireEvent.drop(form!, { dataTransfer: { files: [] } });
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it("ignores empty file selections", () => {
    const onAttach = vi.fn();
    render(<Composer onSend={vi.fn(async () => undefined)} onAttach={onAttach} />);
    const input = screen.getByLabelText("Прикрепить файл");

    fireEvent.change(input, { target: { files: null } });
    fireEvent.change(input, { target: { files: [] } });

    expect(onAttach).not.toHaveBeenCalled();
  });

  it("attaches multiple selected files", () => {
    const onAttach = vi.fn();
    render(<Composer onSend={vi.fn(async () => undefined)} onAttach={onAttach} />);
    const first = new File(["a"], "a.txt", { type: "text/plain" });
    const second = new File(["b"], "b.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText("Прикрепить файл"), {
      target: { files: [first, second] },
    });

    expect(onAttach).toHaveBeenCalledWith([first, second]);
  });
});
