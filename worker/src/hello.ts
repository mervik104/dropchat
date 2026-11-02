import { APP_NAME, PROTOCOL_VERSION, type HelloResponse } from "@dropchat/shared";

export function hello(): HelloResponse {
  return {
    app: APP_NAME,
    protocol: PROTOCOL_VERSION,
    runtime: "worker",
  };
}
