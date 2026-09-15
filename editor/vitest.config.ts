/**
 * vitest.config.ts
 *
 * Usage scope: Vitest unit-test configuration for the CLQ Proofing Editor app.
 *
 * Purpose: jsdom environment (for component/DOM tests), a shared setup file that loads
 * jest-dom matchers, and a v8 coverage config enforcing 100% coverage on `lib/**` and
 * `components/**` — the two directories that will hold the ported editor logic and UI, per the
 * repo's `CLAUDE.md` force rule ("every new public function must be ... covered by a test").
 * Configs/types are excluded from the coverage gate per `CLAUDE.md`'s documented exclusions.
 *
 * Protocol: `coverage.all: true` plus the include globs below mean an empty run (no lib/
 * components files yet) reports 0/0 covered files rather than failing the threshold — this is
 * expected until the editor logic is ported in a later task. Do not lower the 100% thresholds
 * without updating the documented exclusion list in `CLAUDE.md`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["lib/**/*.ts", "components/**/*.tsx"],
      exclude: [
        "**/*.config.*",
        "**/*.d.ts",
        "**/types.ts",
        "**/*.test.*",
        "**/*.spec.*",
        "app/**",
        "e2e/**",
        "node_modules/**",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
