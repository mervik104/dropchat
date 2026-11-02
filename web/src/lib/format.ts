export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const PLATFORM_LABELS: Record<string, string> = {
  web: "Веб",
  macos: "macOS",
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  ipad: "iPad",
  android: "Android",
};

export function formatPlatform(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] ?? platform;
}

export function formatClockTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

