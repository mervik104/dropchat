import { APP_NAME } from "@dropchat/shared";
import { Hono } from "hono";

import { createAuthMiddleware, type AppEnv } from "./auth";
import { corsMiddleware } from "./cors";
import { registerDevice } from "./devices";
import { hello } from "./hello";
import { listPeers } from "./peers";

export interface AppOptions {
  now?: () => number;
  registrationLimit?: number;
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const now = options.now ?? Date.now;
  const app = new Hono<AppEnv>();
  const requireDevice = createAuthMiddleware(now);

  app.use("/api/*", corsMiddleware());

  app.get("/api/hello", (c) => c.json(hello()));

  app.get("/api/health", async (c) => {
    await c.env.DB.prepare("SELECT 1").run();
    return c.json({ ok: true, app: APP_NAME });
  });

  app.post("/api/devices", (c) =>
    registerDevice(c, now, options.registrationLimit),
  );

  app.get("/api/peers", requireDevice, listPeers);

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
