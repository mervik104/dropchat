import { Icon, type IconProps } from "./base";

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4.5 4.5v12.5H6Z" />
      <path d="M14 3.5V8h4.5" />
    </Icon>
  );
}

export function ImageFileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m5 17 4.5-4.5 3 3 2.5-2.5L20 17" />
    </Icon>
  );
}

export function VideoFileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="12.5" height="13" rx="3" />
      <path d="m16 10 4.5-2.5v9L16 14" />
    </Icon>
  );
}

export function AudioFileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Icon>
  );
}

export function ArchiveFileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M12 4v5M12 9l2 2-2 2M12 13l2 2-2 2M12 17h2" />
    </Icon>
  );
}

export function DocFileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4.5 4.5v12.5H6Z" />
      <path d="M14 3.5V8h4.5M9 12h6M9 15.5h6" />
    </Icon>
  );
}

export function PdfFileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5h8l4.5 4.5v12.5H6Z" />
      <path d="M14 3.5V8h4.5M8.5 16.5v-4h1.5a1.2 1.2 0 0 1 0 2.4H8.5M13 16.5v-4h1a1.5 1.5 0 0 1 0 4h-1Z" />
    </Icon>
  );
}
