import { Icon, type IconProps } from "./base";

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="3" />
      <path d="M10.5 5.5h3M11 18.5h2" />
    </Icon>
  );
}

export function TabletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="3" width="15" height="18" rx="3" />
      <path d="M11 18h2" />
    </Icon>
  );
}

export function LaptopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="5" width="14" height="10" rx="2" />
      <path d="M3 19h18M9 15l-1 4M15 15l1 4" />
    </Icon>
  );
}

export function DesktopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2.5" />
      <path d="M12 16.5V20M8.5 20h7" />
    </Icon>
  );
}

export function WifiIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 9.5a13 13 0 0 1 17 0M6.5 13a8.5 8.5 0 0 1 11 0M9.5 16.5a4 4 0 0 1 5 0" />
      <circle cx="12" cy="19.5" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.2 18.5h10.3a3.7 3.7 0 0 0 .3-7.4 5.7 5.7 0 0 0-11-1.5A4.1 4.1 0 0 0 7.2 18.5Z" />
    </Icon>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 2.5 5.5 13.5h6l-1 8 8-11h-6l1-8Z" />
    </Icon>
  );
}
