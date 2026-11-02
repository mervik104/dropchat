import { APP_NAME } from "@dropchat/shared";
import { Hono } from "hono";

import type { Env } from "./env";
import { hello } from "./hello";

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/api/hello", (c) => c.json(hello()));

  app.get("/api/health", async (c) => {
    await c.env.DB.prepare("SELECT 1").run();
    return c.json({ ok: true, app: APP_NAME });
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
