export interface HealthClient {
  check(): Promise<boolean>;
}

export function createHealthClient(fetchImpl: typeof fetch, apiUrl: string): HealthClient {
  return {
    async check(): Promise<boolean> {
      try {
        const response = await fetchImpl(`${apiUrl}/api/health`);
        if (!response.ok) {
          return false;
        }

        const body = (await response.json()) as { ok?: boolean };
        return body.ok === true;
      } catch {
        return false;
      }
    },
  };
}
