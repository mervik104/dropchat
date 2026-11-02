import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // React bootstrap only.
        "src/main.tsx",
        // Test setup and ambient declarations.
        "src/test/**",
        "src/vite-env.d.ts",
        // Thin browser wrappers are exercised through fakes in tests.
        "src/platform/**",
        // Presentation-only primitives, icons, and the logo placeholder.
        // Feature behaviour under src/features, src/hooks, and src/app stays
        // covered at 100%.
        "src/ui/**",
      ],
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
