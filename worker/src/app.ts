import { APP_NAME } from "@dropchat/shared";
import { Hono } from "hono";

import { createAuthMiddleware, type AppEnv } from "./auth";
import { corsMiddleware } from "./cors";
import { registerDevice, updateDevice } from "./devices";
import { hello } from "./hello";
import { listMessages, sendTextMessage } from "./messages";
import { listPeers } from "./peers";
import { sha256Hex } from "./crypto";
import { randomBase64Url } from "./random";
import { randomInviteCode } from "./invite-code";
import { requestPeer, respondToPeer } from "./links";
import { createInvite, redeemInvite } from "./invites";
import { notifyThroughHub, type Notifier } from "./notify";
import {
  DEFAULT_MESSAGE_LIMIT_PER_MINUTE,
  DEFAULT_PROFILE_LIMIT_PER_HOUR,
  DEFAULT_WS_TICKET_LIMIT_PER_MINUTE,
  enforceEndpointLimit,
  parseLimit,
} from "./rate-limit";

export interface AppOptions {
  now?: () => number;
  registrationLimit?: number;
  ticketFactory?: () => string;
  notifyEvent?: Notifier;
  inviteCodeFactory?: () => string;
  messageLimitPerMinute?: number;
  wsTicketLimitPerMinute?: number;
  profileLimitPerHour?: number;
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const now = options.now ?? Date.now;
  const ticketFactory = options.ticketFactory ?? (() => randomBase64Url(32));
  const inviteCodeFactory = options.inviteCodeFactory ?? randomInviteCode;
  const notify = options.notifyEvent ?? notifyThroughHub;
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

  app.patch("/api/devices/me", requireDevice, async (c) => {
    const limited = await enforceEndpointLimit(
      c,
      "profile",
      now(),
      3_600_000,
      options.profileLimitPerHour ??
        parseLimit(
          c.env.PROFILE_UPDATE_LIMIT_PER_HOUR,
          DEFAULT_PROFILE_LIMIT_PER_HOUR,
        ),
    );
    return limited ?? updateDevice(c);
  });

  app.post("/api/ws-ticket", requireDevice, async (c) => {
    const limited = await enforceEndpointLimit(
      c,
      "ws-ticket",
      now(),
      60_000,
      options.wsTicketLimitPerMinute ??
        parseLimit(
          c.env.WS_TICKET_LIMIT_PER_MINUTE,
          DEFAULT_WS_TICKET_LIMIT_PER_MINUTE,
        ),
    );
    if (limited) {
      return limited;
    }

    const ticket = ticketFactory();
    const expiresAt = now() + 30_000;

    await c.env.DB.prepare(
      "INSERT INTO ws_tickets (ticket_hash, device_id, expires_at, used) VALUES (?, ?, ?, 0)",
    )
      .bind(await sha256Hex(ticket), c.get("device").id, expiresAt)
      .run();

    return c.json({ ticket, expiresAt });
  });

  app.get("/api/ws", async (c) => {
    if (c.req.header("Upgrade") !== "websocket") {
      return c.json({ error: "upgrade_required" }, 426);
    }

    const ticket = c.req.query("ticket");
    if (!ticket) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const row = await c.env.DB.prepare(
      `UPDATE ws_tickets
       SET used = 1
       WHERE ticket_hash = ? AND used = 0 AND expires_at > ?
       RETURNING device_id`,
    )
      .bind(await sha256Hex(ticket), now())
      .first<{ device_id: string }>();

    if (!row) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Device-Id", row.device_id);
    const hub = c.env.HUB.get(c.env.HUB.idFromName(row.device_id));
    return hub.fetch(
      new Request("https://hub/ws", { method: "GET", headers }),
    );
  });

  app.get(
    "/api/chats/:peerId/messages",
    requireDevice,
    listMessages,
  );

  app.post("/api/chats/:peerId/messages", requireDevice, async (c) => {
    const limited = await enforceEndpointLimit(
      c,
      "message",
      now(),
      60_000,
      options.messageLimitPerMinute ??
        parseLimit(
          c.env.MESSAGE_LIMIT_PER_MINUTE,
          DEFAULT_MESSAGE_LIMIT_PER_MINUTE,
        ),
    );
    return limited ?? sendTextMessage(c, now, notify);
  });

  app.get("/api/peers", requireDevice, listPeers);

  app.post("/api/peers/request", requireDevice, (c) =>
    requestPeer(c, now, notify),
  );

  app.post("/api/peers/respond", requireDevice, (c) =>
    respondToPeer(c, now, notify),
  );

  app.post("/api/invites", requireDevice, (c) =>
    createInvite(c, now, inviteCodeFactory),
  );

  app.post("/api/invites/redeem", requireDevice, (c) =>
    redeemInvite(c, now, notify),
  );

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
