import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GOOGLE_CLIENT_ID: "test-client-id",
          GOOGLE_CLIENT_SECRET: "test-client-secret",
          GOOGLE_REFRESH_TOKEN: "test-refresh-token",
          DRIVE_FOLDER_ID: "folder-id",
          INTERNAL_KEY: "test-internal-key",
          RETRY_BASE_MS: "0",
          TOKEN_REFRESH_DELAY_MS: "5",
        },
      },
    }),
  ],
  test: {
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.ts"],
      // Entry point only wires the fetch handler.
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
