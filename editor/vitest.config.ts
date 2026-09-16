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
 * Protocol: on Vitest 4, `coverage.all` was removed (see the v4 migration guide) — defining
 * `coverage.include` below now supplies that same behaviour on its own: any file matching
 * `lib/**\/*.ts` / `components/**\/*.tsx` that no test ever imports is still reported at 0%
 * coverage and fails the threshold, not silently omitted. (An empty run before any lib/
 * components files exist still reports 0/0 covered files rather than failing.) Do not lower the
 * 100% thresholds without updating the documented exclusion list in `CLAUDE.md`.
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
 * this repo gets transitively via `vitest@4`.
 *
 * `test.exclude` adds Vitest's own default excludes back explicitly plus `e2e/**`: Vitest's
 * default test-file glob (`**\/*.{test,spec}.*`) otherwise picks up `e2e/roundtrip.spec.ts`
 * (a Playwright spec, run separately via `npx playwright test`) and fails it with "Playwright
 * Test did not expect test.describe() to be called here" — `e2e/**` here is test *discovery*
 * scope, independent of `coverage.exclude`'s `e2e/**` above (which only scopes the coverage
 * report).
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
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
