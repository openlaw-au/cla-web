# CLAUDE.md

Claude rules for `cla-web` — Commercial Law Association of Australia websites.

## Repo overview

Two jobs:

1. **Publish CLQ** — present built issues from `openlaw-au/cla-clq` (PDF + web reading view)
   via `site/build-site.py` + `site/issues.json`, deployed to GitHub Pages.
2. **Proof editing** — the **CLQ Proofing Editor** (`editor/`), a **Next.js 16 + React 19 +
   TypeScript** app (App Router), so editors correct copy in rich text without touching LaTeX.
   It round-trips Markdown (headings, italics, bold, small caps, quotes, lists, footnotes)
   against `openlaw-au/cla-clq` via the GitHub contents API. The press build always happens in
   `cla-tamara-print`'s CI — this repo is never the source of truth for the final PDF.

## Commands

Editor (`editor/`):

```bash
npm run dev              # Next.js dev server
npm test                 # Vitest unit tests
npm run test:e2e         # Playwright end-to-end round-trip tests
npm run lint
npm run typecheck
```

Public site (`site/`):

```bash
pytest --cov --cov-branch --cov-fail-under=100
```

## Branch workflow

Work on `dev`. `prod` is the default branch and is protected — merge only via pull request.

## Coverage exclusions (documented, not silent)

- Next.js scaffold/config files (e.g. `next.config.*`, `*.config.ts`, generated route types) —
  excluded from the 100% unit-coverage gate; they carry no logic to test.
- The removed vendored `bundle.js` (legacy offline ProseMirror build) — deleted as part of the
  Next.js rewrite; do not reintroduce a vendored bundle.

Any other exclusion must be named explicitly in the coverage config with a one-line reason —
never a blanket ignore.

## Deploy

- **Editor** (`editor/`) — OpenNext → Cloudflare Workers.
- **Public site** (`site/`) — GitHub Pages, via `.github/workflows/pages.yml`.

## The force rule (MUST)

> Every function, lib/util and file carries a header comment (usage scope, purpose, protocol).
> Any code change MUST update the repo's `.claude/skills/` in the same change to stay accurate;
> every new public function must be documented and covered by a test.
