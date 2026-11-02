import { cx } from "./cx";

export type ProgressBarSize = "sm" | "md" | "lg";
export type ProgressBarTone = "accent" | "success" | "warning" | "danger";

export interface ProgressBarProps {
  /** Omit for an indeterminate bar. */
  value?: number;
  max?: number;
  size?: ProgressBarSize;
  tone?: ProgressBarTone;
  label?: string;
  showValue?: boolean;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
}

const SIZE_CLASSES: Record<ProgressBarSize, string> = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2",
};

const TONE_CLASSES: Record<ProgressBarTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  tone = "accent",
  label,
  showValue = false,
  className,
  trackClassName,
  fillClassName,
}: ProgressBarProps) {
  const indeterminate = value === undefined || Number.isNaN(value);
  const percent = indeterminate
    ? 0
    : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cx("w-full", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : Math.round(percent)}
        aria-valuetext={
          indeterminate ? "Загрузка" : `${Math.round(percent)} процентов`
        }
        className={cx(
          "w-full overflow-hidden rounded-pill bg-sunken",
          SIZE_CLASSES[size],
          trackClassName,
        )}
      >
        {indeterminate ? (
          <span
            className={cx(
              "block h-full w-1/3 animate-progress-indeterminate rounded-pill will-change-transform",
              TONE_CLASSES[tone],
              fillClassName,
            )}
          />
        ) : (
          <span
            className={cx(
              "block h-full w-full origin-left rounded-pill transition-transform duration-300 ease-standard will-change-transform rtl:origin-right",
              TONE_CLASSES[tone],
              fillClassName,
            )}
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        )}
      </div>

      {showValue ? (
        <p className="mt-1 text-right text-2xs font-medium tabular-nums text-muted">
          {indeterminate ? "…" : `${Math.round(percent)}%`}
        </p>
      ) : null}
    </div>
  );
}
