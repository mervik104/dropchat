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
    const allowed =
      origin !== undefined && isAllowedOrigin(origin, c.env.WEB_ORIGIN);

    if (c.req.method === "OPTIONS") {
      applyCorsHeaders(c, origin, allowed);
      return c.body(null, 204);
    }

    await next();
    applyCorsHeaders(c, origin, allowed);
  };
}

function applyCorsHeaders(
  c: Context<AppEnv>,
  origin: string | undefined,
  allowed: boolean,
): void {
  if (c.res.status === 101) {
    return;
  }

  c.res.headers.set("Vary", "Origin");

  if (!allowed || origin === undefined) {
    return;
  }

  c.res.headers.set("Access-Control-Allow-Origin", origin);
  c.res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  c.res.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Content-Range, Range",
  );
  c.res.headers.set("Access-Control-Max-Age", "86400");
}
