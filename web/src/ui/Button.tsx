import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "ghost"
  | "success"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent shadow-soft hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "border border-border bg-surface text-fg shadow-soft hover:bg-sunken active:bg-sunken",
  soft: "bg-accent-soft text-accent-soft-fg hover:brightness-[0.97] active:brightness-[0.94] dark:hover:brightness-110 dark:active:brightness-125",
  ghost: "text-muted hover:bg-sunken hover:text-fg active:bg-sunken",
  success: "bg-success text-on-success shadow-soft hover:bg-success-hover",
  danger: "bg-danger text-on-danger shadow-soft hover:bg-danger-hover",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 rounded-control px-3 text-xs",
  md: "h-11 gap-2 rounded-control px-4 text-sm",
  lg: "h-12 gap-2.5 rounded-control px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      leadingIcon,
      trailingIcon,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cx(
          "inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[transform,background-color,border-color,box-shadow,color,filter] duration-150 ease-standard active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner size="sm" /> : leadingIcon}
        {children}
        {trailingIcon}
      </button>
    );
  },
);

Button.displayName = "Button";
