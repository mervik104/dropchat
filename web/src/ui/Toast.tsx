import type { ReactNode } from "react";

import { cx } from "./cx";
import { IconButton } from "./IconButton";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastProps {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  icon?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}

const ICON_CLASSES: Record<ToastTone, string> = {
  info: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Toast({
  title,
  description,
  tone = "info",
  icon,
  action,
  onClose,
  closeLabel = "Закрыть уведомление",
  className,
}: ToastProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-atomic="true"
      className={cx(
        "pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-card border border-border bg-elevated/95 p-3.5 text-fg shadow-pop backdrop-blur-xl",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
          ICON_CLASSES[tone],
        )}
      >
        {icon ?? <span className="size-2 rounded-full bg-current" />}
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold leading-5">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>

      {onClose ? (
        <IconButton
          label={closeLabel}
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="-mr-1.5 -mt-1.5"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </IconButton>
      ) : null}
    </div>
  );
}

export interface ToastViewportProps {
  children: ReactNode;
  className?: string;
}

export function ToastViewport({ children, className }: ToastViewportProps) {
  return (
    <div
      role="region"
      aria-label="Уведомления"
      className={cx(
        "pointer-events-none fixed inset-x-3 top-3 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-full sm:max-w-sm",
        className,
      )}
      style={{
        zIndex: "var(--dc-z-toast)",
        paddingTop: "var(--dc-safe-top)",
      }}
    >
      {children}
    </div>
  );
}
