/**
 * vitest.setup.ts
 *
 * Usage scope: Vitest global setup file, loaded once per test file via
 * `vitest.config.ts`'s `test.setupFiles`.
 *
 * Purpose: registers `@testing-library/jest-dom`'s custom matchers (e.g. `toBeInTheDocument`)
 * on Vitest's `expect`, so component tests written against Testing Library read naturally.
 *
 * Protocol: keep this file limited to global test-environment setup (matcher registration,
 * global mocks) — test-specific setup belongs in the individual test file, not here.
 */
import "@testing-library/jest-dom";
