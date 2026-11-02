import type { TransferStatus } from "../../lib/transfer-mode";

export const STATUS_LABEL: Record<TransferStatus, string> = {
  connecting: "подключение напрямую…",
  local: "локально",
  cloud: "облако",
  fallback: "облако, резерв",
};
