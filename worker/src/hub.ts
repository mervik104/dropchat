import type { Env } from "./env";

interface SocketAttachment {
  deviceId: string;
}

export class Hub {
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

    if (url.pathname === "/notify" && request.method === "POST") {
      const event = await request.json();
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
      await this.notifyLinkedPeers(deviceId, true);

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
      typeof record.signal !== "object" ||
      record.signal === null
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
    const { deviceId } = socket.deserializeAttachment() as SocketAttachment;
    const remaining = this.ctx
      .getWebSockets()
      .filter((candidate) => candidate !== socket).length;

    if (remaining === 0) {
      await this.notifyLinkedPeers(deviceId, false);
    }
  }

  private async notifyLinkedPeers(deviceId: string, online: boolean): Promise<void> {
    const result = await this.env.DB.prepare(
      `SELECT CASE WHEN device_a = ? THEN device_b ELSE device_a END AS peer_id
       FROM peers
       WHERE device_a = ? OR device_b = ?`,
    )
      .bind(deviceId, deviceId, deviceId)
      .all<{ peer_id: string }>();

    await Promise.all(
      result.results.map(async ({ peer_id }) => {
        const stub = this.env.HUB.get(this.env.HUB.idFromName(peer_id));
        await stub.fetch("https://hub/notify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "presence", deviceId, online }),
        });
      }),
    );
  }
}
