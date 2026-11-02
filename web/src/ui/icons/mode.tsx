import type { ComponentType } from "react";

import type { TransferMode } from "../../lib/transfer-mode";
import type { IconProps } from "./base";
import { BoltIcon, CloudIcon } from "./devices";
import { SparklesIcon } from "./interface";

const MODE_ICONS: Record<TransferMode, ComponentType<IconProps>> = {
  auto: SparklesIcon,
  local: BoltIcon,
  cloud: CloudIcon,
};

export interface ModeGlyphProps extends IconProps {
  mode: TransferMode;
}

export function ModeGlyph({ mode, ...props }: ModeGlyphProps) {
  const Glyph = MODE_ICONS[mode];
  return <Glyph {...props} />;
}
