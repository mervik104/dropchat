export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistence is best-effort; the app still works without it.
  }
}
