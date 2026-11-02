import { APP_NAME } from "@dropchat/shared";

export function gatewayHealth(): {
  ok: true;
  app: string;
  service: "drive-gateway";
} {
  return { ok: true, app: APP_NAME, service: "drive-gateway" };
}
