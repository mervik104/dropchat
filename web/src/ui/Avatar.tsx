import type { ReactNode } from "react";

import { cx } from "./cx";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  name: string;
  /** Stable seed for the generated gradient; falls back to the name. */
  seed?: string;
  size?: AvatarSize;
  online?: boolean;
  /** Optional platform glyph rendered instead of initials. */
  icon?: ReactNode;
  /** Decorative avatars next to a visible name should skip the aria label. */
  decorative?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-2xl",
};

const DOT_CLASSES: Record<AvatarSize, string> = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
  xl: "size-4",
};

const GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ["#1e3a8a", "#2f5bff"],
  ["#064e3b", "#0b7a59"],
  ["#4c1d95", "#6d28d9"],
  ["#7c2d12", "#c2410c"],
  ["#164e63", "#0e7490"],
  ["#881337", "#be123c"],
  ["#3f6212", "#4d7c0f"],
  ["#581c87", "#7e22ce"],
];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function Avatar({
  name,
  seed,
  size = "md",
  online,
  icon,
  decorative = false,
  className,
}: AvatarProps) {
  const [from, to] = GRADIENTS[hash(seed ?? name) % GRADIENTS.length];

  return (
    <span
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={
        decorative
          ? undefined
          : online === undefined
            ? name
            : `${name}, ${online ? "в сети" : "не в сети"}`
      }
      className={cx("relative inline-flex shrink-0", SIZE_CLASSES[size], className)}
    >
      <span
        className="flex size-full items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide text-white ring-1 ring-inset ring-white/20 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.28)]"
        style={{
          backgroundImage: `linear-gradient(145deg, ${from} 0%, ${to} 100%)`,
        }}
      >
        {icon ?? initials(name)}
      </span>

      {online === undefined ? null : (
        <span
          aria-hidden="true"
          className={cx(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-surface bg-surface",
            DOT_CLASSES[size],
          )}
        >
          {online ? (
            <span className="absolute inset-0 animate-online rounded-full bg-online" />
          ) : null}
          <span
            className={cx(
              "relative size-full rounded-full",
              online ? "bg-online" : "bg-border-strong",
            )}
          />
        </span>
      )}
    </span>
  );
}
