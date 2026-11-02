export interface LoadingScreenProps {
  onOpenOffline: () => void;
}

export function LoadingScreen({ onOpenOffline }: LoadingScreenProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">DropChat</h1>
        <p aria-live="polite" className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Загрузка DropChat…
        </p>
        <button
          type="button"
          onClick={onOpenOffline}
          className="mt-5 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold hover:bg-stone-200 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Офлайн-передача
        </button>
      </div>
    </main>
  );
}
