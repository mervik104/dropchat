import { isRtcSignal } from "@dropchat/shared";

import type { Env } from "./env";
import { loadPeersForDevice } from "./peers-data";

interface SocketAttachment {
  deviceId: string;
}

export class Hub {
  private offlineNotified = new Set<string>();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/presence" && request.method === "GET") {
      return Response.json({
        online: this.ctx.getWebSockets().length > 0,
      });
    }

    if (url.pathname === "/refresh" && request.method === "POST") {
      const deviceId = this.currentDeviceId();
      if (deviceId) {
        await this.pushSnapshot(deviceId);
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === "/notify" && request.method === "POST") {
      const event = (await request.json()) as unknown;
      if (
        typeof event === "object" &&
        event !== null &&
        (event as Record<string, unknown>).type === "peers.refresh"
      ) {
        const deviceId = this.currentDeviceId();
        if (deviceId) {
          await this.pushSnapshot(deviceId);
        }
        return Response.json({ ok: true });
      }
      for (const socket of this.ctx.getWebSockets()) {
        socket.send(JSON.stringify(event));
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      const deviceId = request.headers.get("X-Device-Id");
      if (!deviceId) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ deviceId } satisfies SocketAttachment);
      const firstSocket = this.ctx.getWebSockets().length === 1;
      if (firstSocket) {
        this.offlineNotified.delete(deviceId);
      }
      await this.pushSnapshot(deviceId);
      if (firstSocket) {
        await this.refreshRelatedDevices(deviceId);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return Response.json({ ok: true, service: "hub" });
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") {
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse(message) as unknown;
    } catch {
      return;
    }

    if (typeof event !== "object" || event === null) {
      return;
    }

    const record = event as Record<string, unknown>;
    if (
      record.type !== "signal" ||
      typeof record.toDeviceId !== "string" ||
      !isRtcSignal(record.signal)
    ) {
      return;
    }

    const { deviceId } = socket.deserializeAttachment() as SocketAttachment;
    if (record.toDeviceId === deviceId) {
      return;
    }

    const [first, second] = [deviceId, record.toDeviceId].sort();
    const linked = await this.env.DB.prepare(
      "SELECT 1 AS linked FROM peers WHERE device_a = ? AND device_b = ?",
    )
      .bind(first, second)
      .first<{ linked: number }>();
    if (!linked) {
      return;
    }

    const stub = this.env.HUB.get(
      this.env.HUB.idFromName(record.toDeviceId),
    );
    await stub.fetch("https://hub/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "signal",
        fromDeviceId: deviceId,
        signal: record.signal,
      }),
    });
  }

  async webSocketClose(
    socket: WebSocket,
    _code: number,
    _reason: string,
  ): Promise<void> {
    await this.handleSocketGone(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.handleSocketGone(socket);
  }

  private async handleSocketGone(socket: WebSocket): Promise<void> {
    const { deviceId } = socket.deserializeAttachment() as SocketAttachment;
    const remaining = this.ctx
      .getWebSockets()
      .filter((candidate) => candidate !== socket).length;

    if (remaining === 0 && !this.offlineNotified.has(deviceId)) {
      this.offlineNotified.add(deviceId);
      await this.refreshRelatedDevices(deviceId);
    }
  }

  private currentDeviceId(): string | null {
    const socket = this.ctx.getWebSockets()[0];
    if (!socket) {
      return null;
    }
    const { deviceId } = socket.deserializeAttachment() as SocketAttachment;
    return deviceId;
  }

  private async pushSnapshot(deviceId: string): Promise<void> {
    const device = await this.env.DB.prepare(
      "SELECT ip_group FROM devices WHERE id = ?",
    )
      .bind(deviceId)
      .first<{ ip_group: string }>();
    if (!device) {
      return;
    }

    const ttlValue = Number(this.env.PEER_REQUEST_TTL_HOURS);
    const ttlHours =
      Number.isFinite(ttlValue) && ttlValue > 0 ? ttlValue : 24;
    const peers = await loadPeersForDevice(
      this.env,
      deviceId,
      device.ip_group,
      Date.now(),
      ttlHours,
    );
    const event = JSON.stringify({ type: "peers.snapshot", peers });
    for (const socket of this.ctx.getWebSockets()) {
      socket.send(event);
    }
  }

  private async refreshRelatedDevices(deviceId: string): Promise<void> {
    const device = await this.env.DB.prepare(
      "SELECT ip_group FROM devices WHERE id = ?",
    )
      .bind(deviceId)
      .first<{ ip_group: string }>();
    if (!device) {
      return;
    }

    const [nearby, linked] = await Promise.all([
      this.env.DB.prepare(
        "SELECT id FROM devices WHERE ip_group = ? AND id <> ?",
      )
        .bind(device.ip_group, deviceId)
        .all<{ id: string }>(),
      this.env.DB.prepare(
        `SELECT CASE WHEN device_a = ? THEN device_b ELSE device_a END AS id
         FROM peers
         WHERE device_a = ? OR device_b = ?`,
      )
        .bind(deviceId, deviceId, deviceId)
        .all<{ id: string }>(),
    ]);

    const related = new Set([
      ...nearby.results.map((row) => row.id),
      ...linked.results.map((row) => row.id),
    ]);
    await Promise.allSettled(
      [...related].map((peerId) =>
        this.env.HUB.get(this.env.HUB.idFromName(peerId)).fetch(
          "https://hub/refresh",
          { method: "POST" },
        ),
      ),
    );
  }
}
