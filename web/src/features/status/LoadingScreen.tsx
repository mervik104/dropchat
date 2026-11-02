import { Logo } from "../../ui/Logo";
import { Spinner } from "../../ui/Spinner";

export function LoadingScreen() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-6 text-fg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
      />
      <div className="relative flex flex-col items-center text-center">
        <div className="animate-dialog-in">
          <Logo size={56} variant="full" />
        </div>
        <p
          aria-live="polite"
          className="mt-5 flex items-center gap-2 text-sm font-medium text-muted"
        >
          <Spinner size="sm" />
          Загрузка DropChat…
        </p>
      </div>
    </main>
  );
}
