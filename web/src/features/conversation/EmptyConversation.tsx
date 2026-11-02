export function EmptyConversation() {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div>
        <p className="text-lg font-semibold">Выберите чат</p>
        <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
          Откройте устройство слева или добавьте новое по коду приглашения.
        </p>
      </div>
    </div>
  );
}
