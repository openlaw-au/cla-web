/**
 * next.config.ts
 *
 * Usage scope: Next.js build/runtime configuration for the CLQ Proofing Editor app.
 *
 * Purpose: minimal, OpenNext-compatible config (per the `cloudflare-deploy-openlaw` skill) so
 * the app builds as a standalone server that `@opennextjs/cloudflare` can package for
 * Cloudflare Workers. `output: "standalone"` and a pinned `outputFileTracingRoot` are required
 * by OpenNext; `images.unoptimized` is required because Workers has no Next image optimizer.
 * Actual Worker deploy wiring (wrangler deploy, CI) is left to a later task — this file only
 * needs to keep `npm run build` succeeding today.
 *
 * Protocol: build with `next build --webpack` once OpenNext deploy is wired up in CI — Next 16
 * defaults to Turbopack, whose standalone output is incompatible with OpenNext's bundler (see
 * `cloudflare-deploy-openlaw` skill). Do not add server-side proxy routes to the backend here;
 * data fetching stays client-side per the thin-Worker rule.
 */
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname),
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
