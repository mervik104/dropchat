import { exports } from "cloudflare:workers";
import { vi } from "vitest";

export const INTERNAL_HEADERS = {
  "x-internal-key": "test-internal-key",
};

export function gatewayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(INTERNAL_HEADERS)) {
    headers.set(key, value);
  }

  return exports.default.fetch(
    new Request(`https://gateway.test${path}`, { ...init, headers }),
  );
}

export function rawGatewayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return exports.default.fetch(
    new Request(`https://gateway.test${path}`, init),
  );
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function plainResponse(
  status: number,
  body: unknown,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => plainResponse(status, body),
  } as unknown as Response;
}

export function tokenResponse(expiresIn = 3600): Response {
  return plainResponse(200, {
    access_token: "access-token",
    expires_in: expiresIn,
    token_type: "Bearer",
  });
}

export function stubFetch(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<unknown> | unknown,
) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}
