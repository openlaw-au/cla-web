/**
 * eslint.config.mjs
 *
 * Usage scope: ESLint flat config for the CLQ Proofing Editor Next.js app.
 *
 * Purpose: extends `eslint-config-next`'s native flat-config exports
 * (`eslint-config-next/core-web-vitals`, which itself composes the plain TypeScript rules), per
 * the `next-app-router-migration` skill. `eslint-config-next@16.x` ships flat config directly
 * (no legacy `.eslintrc` shape) — do NOT route it through `@eslint/eslintrc`'s `FlatCompat`,
 * which throws "Converting circular structure to JSON" when it tries to re-validate an
 * already-flat, already-circular plugin config object as a legacy config.
 *
 * Protocol: keep this the single source of ESLint config (no legacy `.eslintrc*`). Any new
 * rule override must be justified with a comment, not added silently.
 */
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
