import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

export type ChipTone = "neutral" | "auto" | "local" | "cloud";
export type ChipSize = "sm" | "md";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  tone?: ChipTone;
  size?: ChipSize;
  icon?: ReactNode;
  children: ReactNode;
}

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: "border-accent/35 bg-accent-soft text-accent-soft-fg",
  auto: "border-mode-auto/35 bg-mode-auto-soft text-mode-auto",
  local: "border-mode-local/35 bg-mode-local-soft text-mode-local",
  cloud: "border-mode-cloud/35 bg-mode-cloud-soft text-mode-cloud",
};

const SIZE_CLASSES: Record<ChipSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-11 gap-2 px-3.5 text-sm",
};

export function Chip({
  selected = false,
  tone = "neutral",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-pill border font-semibold transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-standard active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4",
        SIZE_CLASSES[size],
        selected
          ? TONE_CLASSES[tone]
          : "border-border bg-surface text-muted hover:bg-sunken hover:text-fg",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
