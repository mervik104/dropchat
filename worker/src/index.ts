import { createApp } from "./app";
import type { Env } from "./env";
import { DriveGatewayAdapter } from "./drive-adapter";
import { Hub } from "./hub";
import { runRetention } from "./retention";

const app = createApp();

export { Hub };

export default {
  fetch: app.fetch,
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(
      runRetention(
        env,
        Date.now(),
        new DriveGatewayAdapter(env.DRIVE, env.INTERNAL_KEY),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
