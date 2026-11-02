import { EmptyState } from "../../ui/EmptyState";
import { Logo } from "../../ui/Logo";

export function EmptyConversation() {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-canvas/40 px-6 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent-soft blur-3xl"
      />
      <div className="relative">
        <EmptyState
          illustration={<Logo variant="mark" size={76} />}
          title="Выберите чат"
          description="Откройте устройство слева или добавьте новое по коду приглашения."
        />
      </div>
    </div>
  );
}
