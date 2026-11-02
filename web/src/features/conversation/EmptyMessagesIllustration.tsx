export function EmptyMessagesIllustration() {
  return (
    <svg
      width="132"
      height="104"
      viewBox="0 0 132 104"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="dc-empty-bubble" x1="16" y1="12" x2="92" y2="80">
          <stop stopColor="var(--dc-accent)" />
          <stop offset="1" stopColor="var(--dc-mode-cloud)" />
        </linearGradient>
      </defs>
      <path
        d="M10 24.5C10 17.6 15.6 12 22.5 12h51c6.9 0 12.5 5.6 12.5 12.5v23c0 6.9-5.6 12.5-12.5 12.5H46l-18 15v-15h-5.5C15.6 60 10 54.4 10 47.5v-23Z"
        fill="url(#dc-empty-bubble)"
        fillOpacity="0.16"
        stroke="var(--dc-accent)"
        strokeWidth="1.5"
      />
      <path
        d="M48 58c0-5.5 4.5-10 10-10h56c5.5 0 10 4.5 10 10v18c0 5.5-4.5 10-10 10h-8v12l-14-12H58c-5.5 0-10-4.5-10-10V58Z"
        fill="var(--dc-surface)"
        stroke="var(--dc-border-strong)"
        strokeWidth="1.5"
      />
      <circle cx="66" cy="67" r="2" fill="var(--dc-accent)" />
      <circle cx="81" cy="67" r="2" fill="var(--dc-accent)" opacity="0.65" />
      <circle cx="96" cy="67" r="2" fill="var(--dc-accent)" opacity="0.35" />
    </svg>
  );
}
