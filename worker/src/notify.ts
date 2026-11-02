import type { Env } from "./env";

export type Notifier = (
  env: Env,
  deviceId: string,
  event: unknown,
) => Promise<void>;

export async function notifyThroughHub(
  env: Env,
  deviceId: string,
  event: unknown,
): Promise<void> {
  const stub = env.HUB.get(env.HUB.idFromName(deviceId));
  await stub.fetch("https://hub/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}
