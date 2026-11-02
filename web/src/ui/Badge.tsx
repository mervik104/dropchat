import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "auto"
  | "local"
  | "cloud";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  solid?: boolean;
  icon?: ReactNode;
  dot?: boolean;
}

const SOFT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-muted",
  accent: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  auto: "bg-mode-auto-soft text-mode-auto",
  local: "bg-mode-local-soft text-mode-local",
  cloud: "bg-mode-cloud-soft text-mode-cloud",
};

const SOLID_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-fg text-canvas",
  accent: "bg-accent text-on-accent",
  success: "bg-success text-on-success",
  warning: "bg-warning text-on-warning",
  danger: "bg-danger text-on-danger",
  auto: "bg-mode-auto text-on-accent",
  local: "bg-mode-local text-on-success",
  cloud: "bg-mode-cloud text-on-accent",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 px-1.5 text-2xs",
  md: "h-6 gap-1.5 px-2 text-xs",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  solid = false,
  icon,
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill font-semibold [font-variant-numeric:tabular-nums] [&_svg]:size-3",
        solid ? SOLID_CLASSES[tone] : SOFT_CLASSES[tone],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {icon}
      {children}
    </span>
  );
}
