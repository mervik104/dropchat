import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_IP,
  DEVICE_A,
  DEVICE_B,
  DEVICE_C,
  DEVICE_D,
  DEVICE_E,
  DEVICE_F,
  NOW,
  OTHER_IP,
  SECRET_A,
  SECRET_B,
  SECRET_C,
  SECRET_D,
  SECRET_E,
  SECRET_F,
  api,
  authHeaders,
  linkDevices,
  makeApp,
  register,
} from "./helpers";

interface PeerSummaryBody {
  id: string;
  name: string;
  platform: string;
  online: boolean;
  lastSeen: number;
}

interface PeersBody {
  local: PeerSummaryBody[];
  linked: PeerSummaryBody[];
}

async function getPeers(
  app: ReturnType<typeof makeApp>,
  ip = DEFAULT_IP,
): Promise<Response> {
  return api(app, "/api/peers", { headers: authHeaders(DEVICE_A, SECRET_A) }, ip);
}

describe("GET /api/peers", () => {
  it("separates visible local devices from linked devices", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, secret: SECRET_A, name: "Alpha" });
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      name: "Beta",
      ip: DEFAULT_IP,
    });
    await register(app, {
      deviceId: DEVICE_C,
      secret: SECRET_C,
      name: "Charlie",
      ip: DEFAULT_IP,
    });
    await register(app, {
      deviceId: DEVICE_D,
      secret: SECRET_D,
      name: "Delta",
      ip: OTHER_IP,
    });
    await register(app, {
      deviceId: DEVICE_E,
      secret: SECRET_E,
      name: "Echo",
      ip: OTHER_IP,
    });

    await env.DB.prepare("UPDATE devices SET invisible = 1 WHERE id = ?")
      .bind(DEVICE_C)
      .run();
    await env.DB.prepare("UPDATE devices SET invisible = 1 WHERE id = ?")
      .bind(DEVICE_E)
      .run();
    await linkDevices(DEVICE_A, DEVICE_E);

    const response = await getPeers(app);

    expect(response.status).toBe(200);
    const body = (await response.json()) as PeersBody;
    expect(body).toEqual({
      local: [
        {
          id: DEVICE_B,
          name: "Beta",
          platform: "web",
          online: true,
          lastSeen: NOW,
        },
      ],
      linked: [
        {
          id: DEVICE_E,
          name: "Echo",
          platform: "web",
          online: true,
          lastSeen: NOW,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("ip_group");
    expect(JSON.stringify(body)).not.toContain(SECRET_A);
  });

  it("uses the inclusive 60 second online window for linked peers", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, {
      deviceId: DEVICE_E,
      secret: SECRET_E,
      name: "Echo",
      ip: OTHER_IP,
    });
    await register(app, {
      deviceId: DEVICE_F,
      secret: SECRET_F,
      name: "Foxtrot",
      ip: OTHER_IP,
    });
    await linkDevices(DEVICE_A, DEVICE_E);
    await linkDevices(DEVICE_A, DEVICE_F);

    await env.DB.prepare("UPDATE devices SET last_seen = ? WHERE id = ?")
      .bind(NOW - 60_000, DEVICE_E)
      .run();
    await env.DB.prepare("UPDATE devices SET last_seen = ? WHERE id = ?")
      .bind(NOW - 60_001, DEVICE_F)
      .run();

    const response = await getPeers(app);
    const body = (await response.json()) as PeersBody;

    expect(body.linked).toEqual([
      {
        id: DEVICE_E,
        name: "Echo",
        platform: "web",
        online: true,
        lastSeen: NOW - 60_000,
      },
      {
        id: DEVICE_F,
        name: "Foxtrot",
        platform: "web",
        online: false,
        lastSeen: NOW - 60_001,
      },
    ]);
  });

  it("finds links stored in either sorted direction", async () => {
    const linkedBefore = "aaa-linked-0001";
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, {
      deviceId: linkedBefore,
      secret: "l".repeat(43),
      name: "Linked",
      ip: OTHER_IP,
    });
    await linkDevices(linkedBefore, DEVICE_A);

    const response = await getPeers(app);
    const body = (await response.json()) as PeersBody;

    expect(body.local).toEqual([]);
    expect(body.linked.map((peer) => peer.id)).toEqual([linkedBefore]);
  });

  it("updates ip_group before local discovery", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha", ip: DEFAULT_IP });
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      name: "Beta",
      ip: OTHER_IP,
    });

    const before = (await (await getPeers(app, DEFAULT_IP)).json()) as PeersBody;
    expect(before.local).toEqual([]);

    const response = await getPeers(app, OTHER_IP);
    const after = (await response.json()) as PeersBody;

    expect(response.status).toBe(200);
    expect(after.local).toEqual([
      {
        id: DEVICE_B,
        name: "Beta",
        platform: "web",
        online: true,
        lastSeen: NOW,
      },
    ]);
  });
});
