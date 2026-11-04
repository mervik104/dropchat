import { env } from "cloudflare:workers";

import { createApp } from "../src/app";

export const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
export const DEFAULT_IP = "203.0.113.10";
export const OTHER_IP = "198.51.100.20";

export const DEVICE_A = "device-a-00000001";
export const DEVICE_B = "device-b-00000002";
export const DEVICE_C = "device-c-00000003";
export const DEVICE_D = "device-d-00000004";
export const DEVICE_E = "device-e-00000005";
export const DEVICE_F = "device-f-00000006";

export const SECRET_A = "a".repeat(43);
export const SECRET_B = "b".repeat(43);
export const SECRET_C = "c".repeat(43);
export const SECRET_D = "d".repeat(43);
export const SECRET_E = "e".repeat(43);
export const SECRET_F = "f".repeat(43);

export type TestApp = ReturnType<typeof createApp>;

export function makeApp(now = NOW): TestApp {
  return createApp({ now: () => now });
}

export function authHeaders(deviceId: string, secret: string): HeadersInit {
  return { Authorization: `Bearer ${deviceId}.${secret}` };
}

export function jsonRequest(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function api(
  app: TestApp,
  path: string,
  init: RequestInit = {},
  ip: string | null = DEFAULT_IP,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (ip !== null) {
    headers.set("CF-Connecting-IP", ip);
  }

  return Promise.resolve(
    app.request(`https://dropchat.test${path}`, { ...init, headers }, env),
  );
}

export interface RegisterOptions {
  deviceId?: string;
  secret?: string;
  name?: string;
  platform?: string;
  ip?: string;
}

export async function register(
  app: TestApp,
  options: RegisterOptions = {},
): Promise<Response> {
  return api(
    app,
    "/api/devices",
    jsonRequest({
      deviceId: options.deviceId ?? DEVICE_A,
      secret: options.secret ?? SECRET_A,
      name: options.name ?? "Device A",
      platform: options.platform ?? "web",
    }),
    options.ip ?? DEFAULT_IP,
  );
}

export async function linkDevices(
  deviceA: string,
  deviceB: string,
  createdAt = NOW,
): Promise<void> {
  const [first, second] = [deviceA, deviceB].sort();

  await env.DB.prepare(
    "INSERT INTO peers (device_a, device_b, created_at) VALUES (?, ?, ?)",
  )
    .bind(first, second, createdAt)
    .run();
}

export interface WsTicketBody {
  ticket: string;
  expiresAt: number;
}

export async function issueWsTicket(
  app: TestApp,
  deviceId: string,
  secret: string,
  ip: string = DEFAULT_IP,
): Promise<WsTicketBody> {
  const response = await api(
    app,
    "/api/ws-ticket",
    { method: "POST", headers: authHeaders(deviceId, secret) },
    ip,
  );

  return (await response.json()) as WsTicketBody;
}

export async function openSocket(
  app: TestApp,
  deviceId: string,
  secret: string,
  ip: string = DEFAULT_IP,
): Promise<{ response: Response; socket: WebSocket; initial: unknown }> {
  const { ticket } = await issueWsTicket(app, deviceId, secret, ip);
  const response = await app.request(
    `https://dropchat.test/api/ws?ticket=${encodeURIComponent(ticket)}`,
    { headers: { Upgrade: "websocket" } },
    env,
  );
  const socket = response.webSocket;
  if (!socket) {
    throw new Error("WebSocket was not accepted");
  }
  socket.accept();
  const initial = await nextSocketMessage(socket);
  return { response, socket, initial };
}

export function nextSocketMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 2_000);
    const onMessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(JSON.parse(String(event.data)) as unknown);
    };
    socket.addEventListener("message", onMessage);
  });
}

export async function nextSocketEvent(
  socket: WebSocket,
  type: string,
): Promise<Record<string, unknown>> {
  while (true) {
    const event = await nextSocketMessage(socket);
    if (
      typeof event === "object" &&
      event !== null &&
      (event as Record<string, unknown>).type === type
    ) {
      return event as Record<string, unknown>;
    }
  }
}
