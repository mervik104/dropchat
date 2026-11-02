import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { cx } from "./cx";

export type IconButtonVariant = "solid" | "soft" | "ghost" | "outline" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name. Icon-only controls must always provide one. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  solid: "bg-accent text-on-accent shadow-soft hover:bg-accent-hover",
  soft: "bg-accent-soft text-accent-soft-fg hover:brightness-[0.97] dark:hover:brightness-110",
  ghost: "text-muted hover:bg-sunken hover:text-fg",
  outline:
    "border border-border bg-surface text-fg shadow-soft hover:bg-sunken",
  danger: "text-danger hover:bg-danger-soft",
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: "size-9 [&_svg]:size-[1.125rem]",
  md: "size-11 [&_svg]:size-5",
  lg: "size-12 [&_svg]:size-6",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      variant = "ghost",
      size = "md",
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cx(
          "inline-flex shrink-0 select-none items-center justify-center rounded-full transition-[transform,background-color,border-color,color,filter] duration-150 ease-standard active:scale-95 disabled:pointer-events-none disabled:opacity-45",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
