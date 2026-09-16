/**
 * open-next.config.ts
 *
 * Usage scope: build-time config for `@opennextjs/cloudflare`, which packages this Next.js app
 * as a Cloudflare Worker.
 *
 * Purpose: documented placeholder config per the `cloudflare-deploy-openlaw` skill. Defaults
 * are correct for a thin SSR Worker (no server-side backend proxying — the browser calls the
 * backend directly). Actual deploy wiring (wrangler.toml env names, CI build/deploy steps) is
 * completed in a later task; this file exists now so the OpenNext toolchain is available and
 * documented, without requiring a working deploy in this scaffolding task.
 *
 * Protocol: keep this minimal unless a concrete OpenNext feature (ISR, KV cache, etc.) is
 * required by the ported editor — do not add speculative config.
 */
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
