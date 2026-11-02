import { useEffect, useRef, useState } from "react";

import { copyText } from "./clipboard";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { CheckIcon, CopyIcon } from "./icons";

export interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({
  text,
  label = "Копировать",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy(): Promise<void> {
    await copyText(text);
    setCopied(true);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <IconButton
      label={copied ? "Скопировано" : label}
      size="sm"
      variant="ghost"
      onClick={() => void handleCopy()}
      className={cx(copied && "text-success", className)}
    >
      {copied ? (
        <CheckIcon className="dc-check-draw animate-draw" />
      ) : (
        <CopyIcon />
      )}
    </IconButton>
  );
}
