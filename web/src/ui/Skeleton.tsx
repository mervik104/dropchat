import type { HTMLAttributes } from "react";

import { cx } from "./cx";

export type SkeletonVariant = "block" | "text" | "circle";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  block: "h-4 w-full rounded-card",
  text: "h-3 w-full rounded-pill",
  circle: "size-10 rounded-full",
};

export function Skeleton({
  variant = "block",
  className,
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      {...rest}
      className={cx(
        "relative overflow-hidden bg-sunken",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-shine to-transparent will-change-transform" />
    </div>
  );
}
