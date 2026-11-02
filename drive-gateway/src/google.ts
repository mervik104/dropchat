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
        (error) => error.reason === "rateLimitExceeded",
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
