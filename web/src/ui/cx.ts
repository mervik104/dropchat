export type ClassValue = string | false | null | undefined;

/** Tiny class-name joiner; avoids pulling in a utility dependency. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
