import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        new URL("./migrations", import.meta.url).pathname,
      );

      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SERVER_SALT: "test-server-salt",
            DOWNLOAD_SIGNING_KEY: "test-download-signing-key",
            INTERNAL_KEY: "test-internal-key",
            REGISTRATION_LIMIT_PER_HOUR: "1000",
          },
          // The real service binding is resolved by Wrangler at deploy time.
          // Tests only need a stable local target.
          serviceBindings: {
            DRIVE: async () =>
              new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
              }),
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
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
