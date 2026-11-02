import { createApp } from "./app";
import type { Env } from "./env";
import { Hub } from "./hub";

const app = createApp();

export { Hub };

export default {
  fetch: app.fetch,
  // Retention is implemented in Stage 7.
  scheduled: async () => {},
} satisfies ExportedHandler<Env>;
