import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // The real service binding is resolved by Wrangler at deploy time.
        // Tests only need a stable local target.
        serviceBindings: {
          DRIVE: async () =>
            new Response(JSON.stringify({ ok: true }), {
              headers: { "content-type": "application/json" },
            }),
        },
      },
    }),
  ],
  test: {
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      // Entry point only wires the Hono app and Durable Object export.
      exclude: ["src/index.ts", "src/global.d.ts", "src/env.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
