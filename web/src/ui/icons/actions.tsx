import { Icon, type IconProps } from "./base";

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 11.1 20 4l-7.1 15.8-2.1-6.6-6.6-2.1Z" />
      <path d="m10.8 13.2 4.3-4.3" />
    </Icon>
  );
}

export function PaperclipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8.5 12.5 6.4-6.4a3.4 3.4 0 0 1 4.8 4.8l-7.3 7.3a5.1 5.1 0 0 1-7.2-7.2l7.2-7.2" />
    </Icon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V8M8 12l4-4 4 4" />
      <path d="M5 4.5h14" />
    </Icon>
  );
}

export function AttachIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8.5 12.5 6.4-6.4a3.4 3.4 0 0 1 4.8 4.8l-7.3 7.3a5.1 5.1 0 0 1-7.2-7.2l7.2-7.2" />
      <path d="M8 15h8M12 11v8" />
    </Icon>
  );
}
