import type { HTMLAttributes } from "react";

import { cx } from "./cx";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
};

export function Spinner({
  size = "md",
  className,
  ...rest
}: SpinnerProps) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={cx(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        SIZE_CLASSES[size],
        className,
      )}
    />
  );
}
