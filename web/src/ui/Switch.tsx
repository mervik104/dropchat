import { useId, type ReactNode } from "react";

import { cx } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  /** Required when no visible label is rendered. */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  ariaLabel,
  disabled = false,
  className,
}: SwitchProps) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const descriptionId = `${generatedId}-description`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cx(
        "flex min-h-11 items-center gap-4 rounded-control text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
        label ? "w-full justify-between" : "justify-center",
        className,
      )}
    >
      {label ? (
        <span className="min-w-0">
          <span id={labelId} className="block text-sm font-medium text-fg">
            {label}
          </span>
          {description ? (
            <span
              id={descriptionId}
              className="mt-0.5 block text-xs leading-5 text-muted"
            >
              {description}
            </span>
          ) : null}
        </span>
      ) : null}

      <span
        aria-hidden="true"
        className={cx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-200 ease-standard",
          checked ? "bg-accent" : "bg-border-strong",
        )}
      >
        <span
          className={cx(
            "size-6 rounded-full bg-white shadow-soft transition-transform duration-200 ease-spring",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
