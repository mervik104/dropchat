export async function fetchWithRetry(
  makeRequest: () => Promise<Response>,
  baseDelayMs: number,
  attempts = 3,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await makeRequest();

    if (response.ok || response.status === 308) {
      return response;
    }

    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 403 && (await isRateLimitResponse(response)));

    if (!retryable || attempt === attempts - 1) {
      return response;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, baseDelayMs * 2 ** attempt),
    );
  }
}

export async function isRateLimitResponse(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as {
      error?: { errors?: Array<{ reason?: string }> };
    };
    return (
      body.error?.errors?.some(
        (error) =>
          error.reason === "rateLimitExceeded" ||
          error.reason === "userRateLimitExceeded" ||
          error.reason === "userUploadLimitExceeded",
      ) === true
    );
  } catch {
    return false;
  }
}

export function parseRangeOffset(header: string | null): number {
  const match = /^bytes=\d+-(\d+)$/.exec(header ?? "");
  return match ? Number(match[1]) + 1 : 0;
}

export function parseRetryAfter(
  value: string | null,
  fallbackMs: number,
): number {
  if (!value) {
    return fallbackMs;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return fallbackMs;
}
