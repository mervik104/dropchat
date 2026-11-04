import { describe, expect, it } from "vitest";

import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_C,
  SECRET_A,
  SECRET_B,
  SECRET_C,
  linkDevices,
  makeApp,
  nextSocketEvent,
  openSocket,
  register,
} from "./helpers";

describe("WebSocket signaling", () => {
  it("forwards signals between linked peers only", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await register(app, { deviceId: DEVICE_C, secret: SECRET_C, name: "Gamma" });
    await linkDevices(DEVICE_A, DEVICE_B);

    const { socket: socketA } = await openSocket(app, DEVICE_A, SECRET_A);
    const { socket: socketB } = await openSocket(app, DEVICE_B, SECRET_B);
    const { socket: socketC } = await openSocket(app, DEVICE_C, SECRET_C);

    socketA.send(
      JSON.stringify({
        type: "signal",
        toDeviceId: DEVICE_C,
        signal: { kind: "offer", sdp: "not-allowed" },
      }),
    );

    const event = nextSocketEvent(socketB, "signal");
    socketA.send(
      JSON.stringify({
        type: "signal",
        toDeviceId: DEVICE_B,
        signal: { kind: "offer", sdp: "v=0" },
      }),
    );

    await expect(event).resolves.toEqual({
      type: "signal",
      fromDeviceId: DEVICE_A,
      signal: { kind: "offer", sdp: "v=0" },
    });

    socketC.close(1000, "done");
  });

  it("ignores malformed, binary, and self-targeted signals", async () => {
    const app = makeApp();
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await linkDevices(DEVICE_A, DEVICE_B);

    const { socket: socketA } = await openSocket(app, DEVICE_A, SECRET_A);
    const { socket: socketB } = await openSocket(app, DEVICE_B, SECRET_B);

    const event = nextSocketEvent(socketB, "signal");

    socketA.send("{");
    socketA.send("null");
    socketA.send("\"primitive\"");
    socketA.send(new ArrayBuffer(1));
    socketA.send(JSON.stringify({ type: "unknown" }));
    socketA.send(
      JSON.stringify({
        type: "signal",
        toDeviceId: DEVICE_B,
        signal: { kind: "offer", sdp: "" },
      }),
    );
    socketA.send(
      JSON.stringify({
        type: "signal",
        toDeviceId: DEVICE_B,
        signal: { kind: "bogus" },
      }),
    );
    socketA.send(
      JSON.stringify({
        type: "signal",
        toDeviceId: DEVICE_A,
        signal: { kind: "offer", sdp: "self" },
      }),
    );
    socketA.send(
      JSON.stringify({
        type: "signal",
        toDeviceId: DEVICE_B,
        signal: { kind: "answer", sdp: "v=0" },
      }),
    );

    await expect(event).resolves.toEqual({
      type: "signal",
      fromDeviceId: DEVICE_A,
      signal: { kind: "answer", sdp: "v=0" },
    });
  });
});
