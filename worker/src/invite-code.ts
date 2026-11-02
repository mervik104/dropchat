export function randomInviteCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return String(value % 1_000_000).padStart(6, "0");
}
