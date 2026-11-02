import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { cx } from "./cx";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    leadingIcon,
    trailing,
    className,
    containerClassName,
    disabled,
    "aria-describedby": ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;

  const describedBy =
    [error ? errorId : hint ? hintId : null, ariaDescribedBy]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={containerClassName}>
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-fg"
        >
          {label}
        </label>
      ) : null}

      <div
        className={cx(
          "flex items-center rounded-control border bg-surface transition-[border-color,box-shadow] duration-150",
          error
            ? "border-danger focus-within:ring-2 focus-within:ring-danger/20"
            : "border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
          disabled && "opacity-60",
        )}
      >
        {leadingIcon ? (
          <span className="pl-3 text-muted [&_svg]:size-5">{leadingIcon}</span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
          className={cx(
            "h-11 w-full min-w-0 bg-transparent text-base text-fg placeholder:text-muted focus:outline-none disabled:cursor-not-allowed sm:text-sm",
            leadingIcon ? "pl-2" : "pl-3.5",
            trailing ? "pr-2" : "pr-3.5",
            className,
          )}
        />

        {trailing ? <span className="pr-2">{trailing}</span> : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

Input.displayName = "Input";
