import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Spinner } from "./Spinner";
import { cx } from "./cx";

describe("cx", () => {
  it("joins truthy class names", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("Button", () => {
  it("renders default styles and supports refs", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("bg-accent");
    expect(button.className).toContain("h-11");
    expect(button.className).not.toContain("w-full");
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(ref.current).toBe(button);
    expect((button as HTMLButtonElement).type).toBe("button");
  });

  it("supports variants, size, icons, width, disabled, and submit type", () => {
    render(
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        disabled
        leadingIcon={<span>L</span>}
        trailingIcon={<span>T</span>}
        type="submit"
      >
        Wide
      </Button>,
    );

    const button = screen.getByRole("button", { name: "LWideT" });
    expect(button.className).toContain("border-border");
    expect(button.className).toContain("h-12");
    expect(button.className).toContain("w-full");
    expect(button).toHaveProperty("disabled", true);
    expect((button as HTMLButtonElement).type).toBe("submit");
  });

  it("renders a spinner and busy state while loading", () => {
    render(
      <Button loading size="sm" variant="soft">
        Loading
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Loading" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button).toHaveProperty("disabled", true);
    expect(button.querySelector("span[aria-hidden='true']")).toBeTruthy();
  });
});

describe("IconButton", () => {
  it("renders default and custom styles", () => {
    const { rerender } = render(<IconButton label="Close">X</IconButton>);

    let button = screen.getByRole("button", { name: "Close" });
    expect(button.className).toContain("text-muted");
    expect(button.className).toContain("size-11");

    rerender(
      <IconButton label="Delete" variant="danger" size="lg" type="submit">
        D
      </IconButton>,
    );
    button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("text-danger");
    expect(button.className).toContain("size-12");
    expect((button as HTMLButtonElement).type).toBe("submit");
  });
});

describe("Spinner", () => {
  it("renders default and custom sizes", () => {
    const { rerender } = render(<Spinner />);
    let spinner = document.querySelector("span[aria-hidden='true']");
    expect(spinner?.className).toContain("size-4");

    rerender(<Spinner size="lg" className="custom" />);
    spinner = document.querySelector("span[aria-hidden='true']");
    expect(spinner?.className).toContain("size-5");
    expect(spinner?.className).toContain("custom");
  });
});

import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { Switch } from "./Switch";
import userEvent from "@testing-library/user-event";

describe("Avatar", () => {
  it("renders initials, online status, and decorative mode", () => {
    const { rerender } = render(<Avatar name="Alice Smith" seed="seed" />);
    let avatar = screen.getByRole("img", { name: "Alice Smith" });
    expect(avatar.textContent).toContain("AS");

    rerender(<Avatar name="Alice" online />);
    avatar = screen.getByRole("img", { name: "Alice, в сети" });
    expect(avatar.textContent).toContain("AL");

    rerender(<Avatar name="Alice" online={false} icon={<span>I</span>} size="xl" />);
    avatar = screen.getByRole("img", { name: "Alice, не в сети" });
    expect(avatar.textContent).toContain("I");

    rerender(<Avatar name="   " decorative className="extra" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector(".extra")?.textContent).toContain("?");
  });
});

describe("Badge", () => {
  it("renders default and solid badges with icons and dots", () => {
    const { rerender } = render(<Badge>Auto</Badge>);
    let badge = screen.getByText("Auto");
    expect(badge.className).toContain("bg-sunken");
    expect(badge.className).toContain("h-5");

    rerender(
      <Badge tone="local" size="md" solid dot icon={<span>I</span>}>
        Local
      </Badge>,
    );
    badge = screen.getByText("Local");
    expect(badge.className).toContain("bg-mode-local");
    expect(badge.className).toContain("h-6");
    expect(badge.textContent).toContain("I");
    expect(badge.querySelector("span[aria-hidden='true']")).toBeTruthy();
  });
});

describe("Chip", () => {
  it("renders selected and unselected chips", () => {
    const { rerender } = render(<Chip>Auto</Chip>);
    let chip = screen.getByRole("button", { name: "Auto" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.className).toContain("border-border");

    rerender(
      <Chip selected tone="cloud" size="sm" icon={<span>I</span>} type="submit">
        Cloud
      </Chip>,
    );
    chip = screen.getByRole("button", { name: "ICloud" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.className).toContain("bg-mode-cloud-soft");
    expect(chip.className).toContain("h-8");
    expect((chip as HTMLButtonElement).type).toBe("submit");
  });
});

describe("Switch", () => {
  it("toggles with a visible label and description", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onCheckedChange={onChange}
        label="Invisible"
        description="Hide from nearby"
      />,
    );

    const control = screen.getByRole("switch", { name: "Invisible" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.getAttribute("aria-describedby")).toBeTruthy();
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });


  it("renders a label without a description", () => {
    render(<Switch checked={false} onCheckedChange={vi.fn()} label="Only label" />);
    const control = screen.getByRole("switch", { name: "Only label" });
    expect(control.getAttribute("aria-describedby")).toBeNull();
  });

  it("supports aria labels, checked state, disabled state, and no label", () => {
    const { container } = render(
      <Switch
        checked
        onCheckedChange={vi.fn()}
        ariaLabel="Toggle"
        disabled
      />,
    );
    const control = screen.getByRole("switch", { name: "Toggle" });
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(control).toHaveProperty("disabled", true);
    expect(container.querySelector(".bg-accent")).toBeTruthy();
  });
});

import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { Toast, ToastViewport } from "./Toast";
import { Modal } from "./Modal";

describe("Input", () => {
  it("renders default input without label, hint, or icons", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} placeholder="Name" />);

    const input = screen.getByPlaceholderText("Name");
    expect(ref.current).toBe(input);
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.className).toContain("pl-3.5");
    expect(input.className).toContain("pr-3.5");
  });

  it("renders label, hint, icons, disabled, and external description", () => {
    render(
      <Input
        id="custom"
        label="Email"
        hint="Hint text"
        leadingIcon={<span>L</span>}
        trailing={<span>T</span>}
        disabled
        aria-describedby="external"
      />,
    );

    const input = screen.getByLabelText("Email");
    expect(input.id).toBe("custom");
    expect(input).toHaveProperty("disabled", true);
    expect(input.getAttribute("aria-describedby")).toContain("external");
    expect(input.getAttribute("aria-describedby")).toContain("hint");
    expect(input.className).toContain("pl-2");
    expect(input.className).toContain("pr-2");
    expect(screen.getByText("Hint text")).toBeTruthy();
  });

  it("renders error instead of hint", () => {
    render(
      <Input
        label="Email"
        hint="Hint text"
        error="Required"
        aria-describedby="external"
      />,
    );

    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("error");
    expect(input.getAttribute("aria-describedby")).toContain("external");
    expect(screen.getByRole("alert").textContent).toBe("Required");
    expect(screen.queryByText("Hint text")).toBeNull();
  });
});

describe("Skeleton", () => {
  it("renders all variants", () => {
    const { rerender } = render(<Skeleton />);
    let skeleton = document.querySelector("div[aria-hidden='true']");
    expect(skeleton?.className).toContain("rounded-card");

    rerender(<Skeleton variant="text" className="x" />);
    skeleton = document.querySelector("div[aria-hidden='true']");
    expect(skeleton?.className).toContain("rounded-pill");
    expect(skeleton?.className).toContain("x");

    rerender(<Skeleton variant="circle" />);
    skeleton = document.querySelector("div[aria-hidden='true']");
    expect(skeleton?.className).toContain("rounded-full");
  });
});

describe("Toast", () => {
  it("renders info toast with description, action, close, and default icon", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Toast
        title="Hello"
        description="Details"
        action={<button type="button">Action</button>}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Action" })).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Закрыть уведомление" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("renders danger toast with a custom icon and no close button", () => {
    render(
      <Toast
        title="Error"
        tone="danger"
        icon={<span>!</span>}
        closeLabel="Close custom"
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("!")).toBeTruthy();
  });

  it("renders a toast viewport", () => {
    render(
      <ToastViewport className="custom">
        <span>Child</span>
      </ToastViewport>,
    );
    const region = screen.getByRole("region", { name: "Уведомления" });
    expect(region.className).toContain("custom");
    expect(region.textContent).toBe("Child");
  });
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()}>
        body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an accessible dialog with footer and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal
        open
        onClose={onClose}
        title="Title"
        description="Description"
        footer={<button type="button">Footer</button>}
        variant="dialog"
        size="lg"
      >
        Body
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Footer" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders a sheet with aria label, no close button, and no footer", async () => {
    const user = userEvent.setup();
    render(
      <Modal
        open
        onClose={vi.fn()}
        ariaLabel="Sheet"
        variant="sheet"
        hideCloseButton
      >
        Sheet body
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Sheet" });
    expect(dialog.className).toContain("rounded-t-sheet");
    expect(screen.queryByRole("button")).toBeNull();

    await user.tab();
    expect(document.activeElement).toBe(dialog);
  });

  it("supports auto variant, backdrop close, and restores body overflow", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open onClose={onClose} title="Auto">
        Body
      </Modal>,
    );
    const overlay = document.querySelector(".animate-overlay-in") as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});


import { Hint } from "./Hint";
import { ProgressBar } from "./ProgressBar";
import { fireEvent } from "@testing-library/react";

describe("Hint", () => {
  it("renders neutral and danger hints with icons", () => {
    const { rerender } = render(<Hint>Note</Hint>);
    let hint = screen.getByRole("note");
    expect(hint.className).toContain("bg-sunken");
    expect(hint.querySelector("span[aria-hidden='true']")).toBeTruthy();

    rerender(
      <Hint tone="danger" icon={<span>!</span>} className="custom">
        Danger
      </Hint>,
    );
    hint = screen.getByRole("alert");
    expect(hint.className).toContain("bg-danger-soft");
    expect(hint.className).toContain("custom");
    expect(hint.textContent).toContain("!");
  });
});

describe("ProgressBar", () => {
  it("renders indeterminate progress", () => {
    render(<ProgressBar label="Loading" showValue />);
    const bar = screen.getByRole("progressbar", { name: "Loading" });
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("aria-valuetext")).toBe("Загрузка");
    expect(bar.className).toContain("h-1.5");
    expect(screen.getByText("…")).toBeTruthy();
    expect(bar.querySelector(".animate-progress-indeterminate")).toBeTruthy();
  });

  it("renders determinate progress, clamping, sizes, tones, and classes", () => {
    render(
      <ProgressBar
        value={50}
        max={200}
        size="lg"
        tone="success"
        label="Upload"
        showValue
        className="outer"
        trackClassName="track"
        fillClassName="fill"
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "Upload" });
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(bar.getAttribute("aria-valuetext")).toBe("25 процентов");
    expect(bar.className).toContain("h-2");
    expect(bar.className).toContain("track");
    expect(bar.parentElement?.className).toContain("outer");
    const fill = bar.querySelector("span.fill") as HTMLElement;
    expect(fill.className).toContain("bg-success");
    expect(fill.style.transform).toBe("scaleX(0.25)");
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("treats NaN as indeterminate and clamps overflow", () => {
    const { rerender } = render(<ProgressBar value={Number.NaN} />);
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuetext"),
    ).toBe("Загрузка");

    rerender(<ProgressBar value={300} max={100} size="sm" tone="danger" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.className).toContain("h-1");
  });
});

describe("Modal focus management", () => {
  it("traps focus and ignores unrelated keys", async () => {
    const user = userEvent.setup();
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Focus"
        footer={<button type="button">Footer</button>}
      >
        <button type="button" aria-hidden="true">
          Hidden
        </button>
      </Modal>,
    );

    const close = screen.getByRole("button", { name: "Закрыть" });
    const footer = screen.getByRole("button", { name: "Footer" });
    const hidden = screen.getByText("Hidden");

    fireEvent.keyDown(document, { key: "x" });
    expect(document.activeElement).not.toBe(hidden);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(footer);

    footer.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    await user.click(footer);
  });
});
