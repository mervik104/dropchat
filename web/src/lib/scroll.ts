export function nextScrollTop(input: {
  previousFirstId: string | null;
  nextFirstId: string | null;
  previousHeight: number;
  nextHeight: number;
  previousScrollTop: number;
}): number {
  const prepended =
    input.previousFirstId !== null &&
    input.nextFirstId !== null &&
    input.previousFirstId !== input.nextFirstId;

  return prepended
    ? input.previousScrollTop + (input.nextHeight - input.previousHeight)
    : input.nextHeight;
}
