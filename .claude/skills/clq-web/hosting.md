---
name: hosting
description: Use when deploying or debugging cla-web's hosting — GitHub Pages for the public CLQ site (pages.yml) or Cloudflare Workers/OpenNext for the Next.js proofing editor — including CI triggers, secrets, or wrangler/open-next config.
---

# Hosting

## Overview

The repo's two jobs deploy to two different targets:

| Component | Target | Config |
|---|---|---|
| Public site (`site/`) | GitHub Pages | `.github/workflows/pages.yml` (exists today) |
| Editor (`editor/`) | Cloudflare Workers, via OpenNext | `open-next.config.ts`, `wrangler.toml` (**future** — not yet in the repo; the editor is still being rewritten) |

## Public site — GitHub Pages (`pages.yml`)

Workflow `pages` (job `pages`, concurrency group `pages` so overlapping runs cancel the
older one). Triggers:
- `workflow_dispatch` (manual)
- `push` to `main`, paths-filtered to `site/**` and the workflow file itself — editor
  changes do **not** trigger a public-site deploy.

Two jobs:

1. **`build`** — checks out `cla-web`, then separately checks out `openlaw-au/cla-clq`
   into `_clq/` using a `CLQ_REPO_TOKEN` secret (fine-grained PAT, read access to
   `cla-clq`) since the index/PDFs live in that repo, not this one. Copies
   `_clq/index/all_index.json` → `site/data/all_index.json` (warns, doesn't fail, if
   missing — `build-site.py` degrades gracefully without it, see site-build skill). Runs
   `python3 site/build-site.py --out dist`. Uploads `dist/` as a Pages artifact.
2. **`deploy`** — needs `build`; deploys the artifact via `actions/deploy-pages@v4` to
   the `github-pages` environment.

Permissions are minimal-scoped: `contents: read`, `pages: write`, `id-token: write`.

**One-time setup** (documented in the workflow header, not yet necessarily done): enable
Pages with Source = GitHub Actions, and add the `CLQ_REPO_TOKEN` secret.

**What the workflow does NOT currently do**: it does not copy issue PDFs from `_clq`
into `dist/issues/` even though `mkdir -p dist/issues` runs — the public site doesn't
link PDFs at all right now (see site-build skill: `pdf = None` is hardcoded). Don't
assume PDF-copying logic exists just because the directory is created; that's staged for
when/if a gated-download flow is built.

## Editor — Cloudflare Workers via OpenNext (future)

Per `CLAUDE.md` and `README.md`, the intended deploy is **OpenNext → Cloudflare
Workers**, the standard pattern for a Next.js 16 App Router app on Workers:
`open-next.config.ts` at the editor root building the Worker, deployed with
`wrangler` (`wrangler.toml`/`wrangler.jsonc`). Neither file exists in the repo yet — the
Next.js rewrite (`components/ProofingEditor.tsx`, `lib/editor/*`) is still in progress.
When standing this up:

- Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` configured for
  Wrangler/OpenNext (README's Deployment prerequisites section).
- The GitHub token used by the editor's load/save (see proofing-editor skill) is
  entered in the UI and kept **in memory only** — it is a runtime user credential, not a
  Workers secret; do not wire it into `wrangler.toml`/environment bindings.
- CI trigger per README: "push to `dev`/`prod` (per workflow config)" — no workflow file
  exists yet for this; when adding one, keep it separate from `pages.yml` and scope its
  path filter to `editor/**` (mirroring how `pages.yml` is scoped to `site/**`) so an
  editor deploy and a site deploy never trigger off each other's changes.
- For general Workers/OpenNext/wrangler mechanics (not specific to this repo), load the
  Cloudflare-focused skills (`cloudflare-deploy-openlaw`, `wrangler`) rather than
  duplicating that guidance here.

## Branch model (from repo `CLAUDE.md`)

Work happens on `dev`. `prod` is the default, protected branch — changes land via pull
request only, never a direct push.
