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
 *
 * `test.globals: true` puts `describe`/`it`/`expect`/`vi` in global scope, matching Jest's
 * ambient style. This is required, not cosmetic: `vitest.setup.ts` imports `@testing-library/
 * jest-dom` for its side effect of calling the global `expect.extend(...)`, which throws
 * `ReferenceError: expect is not defined` under `npm test`/`npm run coverage` without globals
 * mode (it only worked previously via an undocumented `--globals` CLI flag). The matching
 * ambient types are declared via `"vitest/globals"` in `tsconfig.json`'s `compilerOptions.types`.
 *
 * `@vitejs/plugin-react` handles `.tsx`'s JSX transform for Vite/Vitest's esbuild-based
 * pipeline, independent of `tsconfig.json`'s `"jsx"` setting (which governs `tsc --noEmit`/
 * `next build`, not Vitest's own esbuild-based transform) — without this plugin Vitest hands
 * raw, untransformed `<Foo />` JSX to Node and fails with `ReferenceError: React is not
 * defined`. Pinned to `^4.7.0` (not the latest major, which requires Vite 8) to match the Vite 7
 * this repo gets transitively via `vitest@3`.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
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
