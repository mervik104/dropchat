import type { TransferMode } from "../../lib/transfer-mode";
import { ModeGlyph } from "../../ui/icons";
import { MODE_LABEL } from "../transfer/modeLabels";

export interface ModeSwitchProps {
  mode: TransferMode;
  onModeChange: (mode: TransferMode) => void;
}

const OPTIONS = ["auto", "local", "cloud"] as const;

const SELECTED_CLASSES: Record<TransferMode, string> = {
  auto: "bg-surface text-mode-auto shadow-soft",
  local: "bg-surface text-mode-local shadow-soft",
  cloud: "bg-surface text-mode-cloud shadow-soft",
};

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Режим передачи"
      className="flex items-center gap-0.5 rounded-pill bg-sunken p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-label={`Режим ${MODE_LABEL[option]}`}
          aria-pressed={mode === option}
          onClick={() => onModeChange(option)}
          className={[
            "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-pill px-2 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-150 ease-standard active:scale-[0.98] sm:h-8 sm:flex-none sm:px-2.5",
            mode === option
              ? SELECTED_CLASSES[option]
              : "text-muted hover:text-fg",
          ].join(" ")}
        >
          <span className="hidden sm:inline-flex">
            <ModeGlyph mode={option} size={14} />
          </span>
          {MODE_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
