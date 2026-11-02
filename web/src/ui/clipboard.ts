/** Best-effort clipboard helper; the UI never blocks on permissions. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access can be denied; the action is intentionally silent.
  }
}
