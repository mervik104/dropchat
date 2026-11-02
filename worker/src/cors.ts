import type { Context, Next } from "hono";

import type { AppEnv } from "./auth";

export function isAllowedOrigin(origin: string, webOrigin: string): boolean {
  if (origin === webOrigin) {
    return true;
  }

  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export function corsMiddleware() {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const origin = c.req.header("Origin");
    c.header("Vary", "Origin");

    if (origin && isAllowedOrigin(origin, c.env.WEB_ORIGIN)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
      c.header("Access-Control-Max-Age", "86400");
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}
