export function appViewportHeight(
  visualViewport: Pick<VisualViewport, "height"> | null | undefined,
  fallback: number,
): number {
  const height = visualViewport?.height ?? fallback;
  if (!Number.isFinite(height) || height <= 0) {
    return Math.max(1, Math.round(fallback));
  }
  return Math.round(height);
}

export function appViewportTop(
  visualViewport: Pick<VisualViewport, "offsetTop"> | null | undefined,
): number {
  const top = visualViewport?.offsetTop ?? 0;
  if (!Number.isFinite(top) || top <= 0) {
    return 0;
  }
  return Math.round(top);
}
