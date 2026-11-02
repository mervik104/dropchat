import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "./cx";
import { IconButton } from "./IconButton";

export type ModalSize = "sm" | "md" | "lg";
export type ModalVariant = "auto" | "dialog" | "sheet";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /**
   * auto: bottom sheet on mobile, centred dialog on desktop.
   * dialog: centred at every breakpoint. sheet: bottom sheet at every breakpoint.
   */
  variant?: ModalVariant;
  closeLabel?: string;
  ariaLabel?: string;
  hideCloseButton?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "auto",
  closeLabel = "Закрыть",
  ariaLabel,
  hideCloseButton = false,
  className,
}: ModalProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current!;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const isDialog = variant === "dialog";
  const isSheet = variant === "sheet";
  const showHeader = Boolean(title || description || !hideCloseButton);

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 flex justify-center",
        isDialog
          ? "items-center p-4 sm:p-6"
          : isSheet
            ? "items-end"
            : "items-end sm:items-center sm:p-6",
      )}
      style={{ zIndex: "var(--dc-z-sheet)" }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 animate-overlay-in bg-overlay"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={!title && ariaLabel ? ariaLabel : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border bg-elevated text-fg shadow-sheet outline-none",
          isDialog
            ? "animate-dialog-in rounded-sheet"
            : isSheet
              ? "animate-sheet-in rounded-t-sheet"
              : "animate-sheet-in rounded-t-sheet sm:animate-dialog-in sm:rounded-sheet",
          SIZE_CLASSES[size],
          className,
        )}
      >
        {!isDialog ? (
          <div
            aria-hidden="true"
            className={cx(
              "flex shrink-0 justify-center pt-2.5",
              isSheet ? "flex" : "flex sm:hidden",
            )}
          >
            <span className="h-1.5 w-10 rounded-pill bg-border-strong" />
          </div>
        ) : null}

        {showHeader ? (
          <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4 sm:px-6">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2
                  id={titleId}
                  className="text-lg font-semibold tracking-tight text-fg"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm leading-5 text-muted"
                >
                  {description}
                </p>
              ) : null}
            </div>
            {hideCloseButton ? null : (
              <IconButton
                label={closeLabel}
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="-mr-2 -mt-1"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </IconButton>
            )}
          </div>
        ) : null}

        <div className="dc-scroll-contain min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="dc-pb-safe shrink-0 border-t border-border px-5 py-3 sm:px-6">
            {footer}
          </div>
        ) : (
          <div className="dc-pb-safe shrink-0" />
        )}
      </div>
    </div>,
    document.body,
  );
}
