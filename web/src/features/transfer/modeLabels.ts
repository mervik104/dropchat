import type { TransferMode, TransferStatus } from "../../lib/transfer-mode";

export const MODE_LABEL: Record<TransferMode, string> = {
  auto: "Авто",
  local: "Локально",
  cloud: "Облако",
};

export const STATUS_LABEL: Record<TransferStatus, string> = {
  connecting: "подключение напрямую…",
  local: "локально",
  cloud: "облако",
  fallback: "облако, резерв",
};
