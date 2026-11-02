import type { ReactNode } from "react";

import { cx } from "./cx";

export type HintTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface HintProps {
  children: ReactNode;
  tone?: HintTone;
  icon?: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<HintTone, string> = {
  neutral: "bg-sunken text-muted",
  info: "bg-accent-soft text-accent-soft-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Hint({
  children,
  tone = "neutral",
  icon,
  className,
}: HintProps) {
  return (
    <p
      role={tone === "danger" ? "alert" : "note"}
      className={cx(
        "flex items-start gap-2 rounded-control px-2.5 py-2 text-xs leading-5 [&_svg]:mt-0.5 [&_svg]:size-4",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="mt-1.5 shrink-0">
        {icon ?? <span className="block size-1.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
