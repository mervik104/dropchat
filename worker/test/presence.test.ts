import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  DEVICE_A,
  DEVICE_B,
  SECRET_A,
  SECRET_B,
  linkDevices,
  makeApp,
  nextSocketMessage,
  openSocket,
  register,
} from "./helpers";

describe("WebSocket presence", () => {
  it("notifies linked peers when a device connects and disconnects", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await linkDevices(DEVICE_A, DEVICE_B);

    const { socket: socketA } = await openSocket(app, DEVICE_A, SECRET_A);
    const onlineEvent = nextSocketMessage(socketA);
    const { socket: socketB } = await openSocket(app, DEVICE_B, SECRET_B);

    await expect(onlineEvent).resolves.toEqual({
      type: "presence",
      deviceId: DEVICE_B,
      online: true,
    });

    const offlineEvent = nextSocketMessage(socketA);
    socketB.close(1000, "done");

    await expect(offlineEvent).resolves.toEqual({
      type: "presence",
      deviceId: DEVICE_B,
      online: false,
    });
  });

  it("stays online while another socket for the same device remains", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    const { socket: first } = await openSocket(app, DEVICE_B, SECRET_B);
    const { socket: second } = await openSocket(app, DEVICE_B, SECRET_B);

    first.close(1000, "one");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stub = env.HUB.get(env.HUB.idFromName(DEVICE_B));
    const online = await stub.fetch("https://hub/presence");
    expect(await online.json()).toEqual({ online: true });

    second.close(1000, "two");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const offline = await stub.fetch("https://hub/presence");
    expect(await offline.json()).toEqual({ online: false });
  });
});
