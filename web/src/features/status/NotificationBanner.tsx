import { BellIcon } from "../../ui/icons";
import { Toast, ToastViewport } from "../../ui/Toast";

export interface NotificationBannerProps {
  message: string;
  onDismiss: () => void;
}

export function NotificationBanner({
  message,
  onDismiss,
}: NotificationBannerProps) {
  return (
    <ToastViewport>
      <Toast
        title={message}
        tone="success"
        icon={<BellIcon />}
        onClose={onDismiss}
        closeLabel="Скрыть уведомление"
      />
    </ToastViewport>
  );
}
