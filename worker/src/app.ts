import type { DriveHealthResponse, StorageAdapter } from "@dropchat/shared";
import { APP_NAME } from "@dropchat/shared";
import { Hono, type Context } from "hono";

import { createAuthMiddleware, type AppEnv } from "./auth";
import { corsMiddleware } from "./cors";
import { registerDevice, updateDevice } from "./devices";
import { DriveGatewayAdapter } from "./drive-adapter";
import {
  cancelFile,
  completeFile,
  createFileLink,
  downloadFile,
  getFileState,
  initFile,
  uploadFilePart,
  DOWNLOAD_LINK_TTL_SECONDS,
  type FileConfig,
  type FileDeps,
} from "./files";
import { hello } from "./hello";
import { listMessages, sendTextMessage } from "./messages";
import { sendP2PFileMessage } from "./p2p-messages";
import { listPeers } from "./peers";
import { sha256Hex } from "./crypto";
import { randomBase64Url } from "./random";
import { randomInviteCode } from "./invite-code";
import {
  blockPeer,
  requestPeer,
  respondToPeer,
  unlinkPeer,
} from "./links";
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
  inviteIpGroupFailureLimit?: number;
  inviteGlobalFailureLimit?: number;
  peerRequestLimitPerHour?: number;
  maxPendingPeerRequests?: number;
  peerRequestTtlHours?: number;
  messageLimitPerMinute?: number;
  storage?: StorageAdapter;
  cloudUploadsEnabled?: boolean;
  maxFileSize?: number;
  perDeviceUploadPer24h?: number;
  perDeviceStoredTotal?: number;
  globalStoredTotal?: number;
  retentionDays?: number;
  downloadLinkTtlSeconds?: number;
  fileInitLimitPerHour?: number;
  filePartLimitPerMinute?: number;
  fileCompleteLimitPerHour?: number;
  fileLinkLimitPerMinute?: number;
  driveHealth?: () => Promise<DriveHealthResponse>;
  wsTicketLimitPerMinute?: number;
  profileLimitPerHour?: number;
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const now = options.now ?? Date.now;
  const ticketFactory = options.ticketFactory ?? (() => randomBase64Url(32));
  const inviteCodeFactory = options.inviteCodeFactory ?? randomInviteCode;
  const notify = options.notifyEvent ?? notifyThroughHub;
  const app = new Hono<AppEnv>();

  const fileDeps = (c: Context<AppEnv>): FileDeps => {
    const config: FileConfig = {
      cloudUploadsEnabled:
        options.cloudUploadsEnabled ??
        c.env.CLOUD_UPLOADS_ENABLED === "true",
      maxFileSize: options.maxFileSize ?? Number(c.env.MAX_FILE_SIZE),
      perDeviceUploadPer24h:
        options.perDeviceUploadPer24h ??
        Number(c.env.PER_DEVICE_UPLOAD_PER_24H),
      perDeviceStoredTotal:
        options.perDeviceStoredTotal ??
        Number(c.env.PER_DEVICE_STORED_TOTAL),
      globalStoredTotal:
        options.globalStoredTotal ?? Number(c.env.GLOBAL_STORED_TOTAL),
      retentionDays:
        options.retentionDays ?? Number(c.env.RETENTION_DAYS),
      downloadLinkTtlSeconds:
        options.downloadLinkTtlSeconds ?? DOWNLOAD_LINK_TTL_SECONDS,
      fileInitLimitPerHour:
        options.fileInitLimitPerHour ??
        parseLimit(c.env.FILE_INIT_LIMIT_PER_HOUR, 50),
      filePartLimitPerMinute:
        options.filePartLimitPerMinute ??
        parseLimit(c.env.FILE_PART_LIMIT_PER_MINUTE, 600),
      fileCompleteLimitPerHour:
        options.fileCompleteLimitPerHour ??
        parseLimit(c.env.FILE_COMPLETE_LIMIT_PER_HOUR, 100),
      fileLinkLimitPerMinute:
        options.fileLinkLimitPerMinute ??
        parseLimit(c.env.FILE_LINK_LIMIT_PER_MINUTE, 60),
    };

    return {
      now,
      storage:
        options.storage ??
        new DriveGatewayAdapter(c.env.DRIVE, c.env.INTERNAL_KEY),
      config,
      notify,
      signingKey: c.env.DOWNLOAD_SIGNING_KEY,
    };
  };
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

  app.post("/api/chats/:peerId/p2p-files", requireDevice, (c) =>
    sendP2PFileMessage(
      c,
      now,
      notify,
      options.messageLimitPerMinute ??
        parseLimit(
          c.env.MESSAGE_LIMIT_PER_MINUTE,
          DEFAULT_MESSAGE_LIMIT_PER_MINUTE,
        ),
    ),
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

  const peerRequestTtlHours = (c: { env: AppEnv["Bindings"] }) =>
    options.peerRequestTtlHours ??
    parseLimit(c.env.PEER_REQUEST_TTL_HOURS, 24);

  app.post("/api/files/init", requireDevice, (c) =>
    initFile(c, fileDeps(c)),
  );

  app.put("/api/files/:id/parts/:n", requireDevice, (c) =>
    uploadFilePart(c, fileDeps(c)),
  );

  app.post("/api/files/:id/complete", requireDevice, (c) =>
    completeFile(c, fileDeps(c)),
  );

  app.get("/api/files/:id/state", requireDevice, getFileState);

  app.post("/api/files/:id/link", requireDevice, (c) =>
    createFileLink(c, fileDeps(c)),
  );

  app.get("/api/files/:id/download", (c) =>
    downloadFile(c, fileDeps(c)),
  );

  app.get("/api/health/drive", requireDevice, async (c) => {
    try {
      const health = options.driveHealth
        ? await options.driveHealth()
        : await new DriveGatewayAdapter(
            c.env.DRIVE,
            c.env.INTERNAL_KEY,
          ).health();
      return c.json(health);
    } catch {
      return c.json({ error: "drive_unavailable" }, 502);
    }
  });

  app.delete("/api/files/:id", requireDevice, (c) =>
    cancelFile(c, fileDeps(c)),
  );

  app.get("/api/peers", requireDevice, (c) =>
    listPeers(c, peerRequestTtlHours(c)),
  );

  app.post("/api/peers/request", requireDevice, (c) =>
    requestPeer(c, now, notify, {
      rateLimitPerHour:
        options.peerRequestLimitPerHour ??
        parseLimit(c.env.PEER_REQUEST_LIMIT_PER_HOUR, 20),
      maxPending:
        options.maxPendingPeerRequests ??
        parseLimit(c.env.MAX_PENDING_PEER_REQUESTS, 10),
      ttlHours: peerRequestTtlHours(c),
    }),
  );

  app.post("/api/peers/respond", requireDevice, (c) =>
    respondToPeer(c, now, notify),
  );

  app.delete("/api/peers/:peerId", requireDevice, unlinkPeer);

  app.post("/api/peers/:peerId/block", requireDevice, (c) =>
    blockPeer(c, now),
  );

  app.post("/api/invites", requireDevice, (c) =>
    createInvite(c, now, inviteCodeFactory),
  );

  app.post("/api/invites/redeem", requireDevice, (c) =>
    redeemInvite(c, now, notify, {
      ipGroupFailures:
        options.inviteIpGroupFailureLimit ??
        parseLimit(c.env.INVITE_IP_GROUP_FAILURE_LIMIT, 20),
      globalFailures:
        options.inviteGlobalFailureLimit ??
        parseLimit(c.env.INVITE_GLOBAL_FAILURE_LIMIT, 100),
    }),
  );

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  return app;
}
