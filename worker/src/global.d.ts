import type { Env as DropChatEnv } from "./env";

declare global {
  namespace Cloudflare {
    interface Env extends DropChatEnv {}

    interface GlobalProps {
      mainModule: typeof import("./index");
      durableNamespaces: "Hub";
    }
  }
}
