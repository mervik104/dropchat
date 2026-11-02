import type { ComponentType } from "react";

import type { IconProps } from "./base";
import {
  DesktopIcon,
  LaptopIcon,
  PhoneIcon,
  TabletIcon,
} from "./devices";

const PLATFORM_ICONS: Record<string, ComponentType<IconProps>> = {
  web: LaptopIcon,
  browser: LaptopIcon,
  macos: LaptopIcon,
  mac: LaptopIcon,
  windows: DesktopIcon,
  linux: DesktopIcon,
  desktop: DesktopIcon,
  ios: PhoneIcon,
  iphone: PhoneIcon,
  android: PhoneIcon,
  phone: PhoneIcon,
  ipad: TabletIcon,
  tablet: TabletIcon,
};

export interface PlatformGlyphProps extends IconProps {
  platform?: string;
}

export function PlatformGlyph({ platform, ...props }: PlatformGlyphProps) {
  const Glyph =
    PLATFORM_ICONS[(platform ?? "web").toLowerCase()] ?? LaptopIcon;
  return <Glyph {...props} />;
}
