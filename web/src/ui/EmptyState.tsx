import type { ReactNode } from "react";

import { cx } from "./cx";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Custom SVG illustration; rendered instead of the icon medallion. */
  illustration?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  illustration,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      {illustration ? (
        <div aria-hidden="true" className="mb-4 text-accent">
          {illustration}
        </div>
      ) : icon ? (
        <div
          aria-hidden="true"
          className={cx(
            "mb-4 flex items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg",
            compact ? "size-12 [&_svg]:size-6" : "size-16 [&_svg]:size-7",
          )}
        >
          {icon}
        </div>
      ) : null}

      <p
        className={cx(
          "font-semibold text-fg",
          compact ? "text-sm" : "text-base",
        )}
      >
        {title}
      </p>

      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
