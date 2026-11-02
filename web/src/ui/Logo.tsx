import { useId } from "react";

import { cx } from "./cx";

/**
 * REPLACE THIS FILE'S SVG TO CHANGE THE LOGO.
 * Keep this component as the single source of truth for the header, splash,
 * empty states, settings/about, and PWA loading screens.
 */
export interface LogoProps {
  size?: number;
  variant?: "mark" | "full";
  className?: string;
}

export function Logo({
  size = 36,
  variant = "full",
  className,
}: LogoProps) {
  const gradientId = useId();

  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="4"
          x2="42"
          y2="45"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2F5BFF" />
          <stop offset="1" stopColor="#7B95FF" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradientId})`} />
      <rect
        x="0.5"
        y="0.5"
        width="47"
        height="47"
        rx="13.5"
        stroke="white"
        strokeOpacity="0.22"
      />
      <path
        d="M13.5 18.2c0-2.6 2.1-4.7 4.7-4.7h11.6c2.6 0 4.7 2.1 4.7 4.7v7.6c0 2.6-2.1 4.7-4.7 4.7h-6.7l-4.9 4v-4h-.1a4.7 4.7 0 0 1-4.6-4.7v-7.6Z"
        fill="white"
        fillOpacity="0.96"
      />
      <path
        d="M24 15.6v8.3m0 0-3.1-3.1M24 23.9l3.1-3.1"
        stroke="#2449D8"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === "mark") {
    return <span className={cx("inline-flex", className)}>{mark}</span>;
  }

  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      {mark}
      <span
        className="font-semibold tracking-[-0.035em] text-fg"
        style={{ fontSize: Math.max(16, size * 0.58), lineHeight: 1 }}
      >
        Drop<span className="text-accent">Chat</span>
      </span>
    </span>
  );
}
