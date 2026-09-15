---
name: clq-web
description: Use when working anywhere in cla-web — the CLA Australia websites repo — including the CLQ Proofing Editor (ProseMirror/Next.js rewrite), the public CLQ landing site, or GitHub Pages / Cloudflare Workers deploy for either.
---

# clq-web

## Overview

`cla-web` does two unrelated jobs in one repo:

1. **Publish CLQ** — a static public landing page listing published issues of the
   *Commercial Law Quarterly*, built from `site/issues.json` by `site/build-site.py`,
   deployed to GitHub Pages.
2. **Proof editing** — the **CLQ Proofing Editor**, a rich-text (ProseMirror) surface so
   editors correct copy without touching LaTeX. It round-trips Markdown against
   `openlaw-au/cla-clq` via the GitHub contents API. Currently a static ES-module app
   (`editor/app.js`); being rewritten into **Next.js 16 + React 19 + TypeScript**
   (`components/ProofingEditor.tsx` + `lib/editor/*`), same behaviour.

Neither job is the source of truth for the final PDF — that's always the LaTeX build in
`cla-tamara-print`'s CI. This repo only proofs and publishes.

## When to load a subskill

| Working on... | Load |
|---|---|
| The editor's ProseMirror schema, toolbar, footnotes, small caps, GitHub load/save | [proofing-editor.md](proofing-editor.md) |
| The exact Markdown ↔ ProseMirror round-trip rules (footnote syntax, serializer rules) | [proofing-editor/markdown-roundtrip.md](proofing-editor/markdown-roundtrip.md) |
| `site/build-site.py`, `issues.json`, the public landing page | [site-build.md](site-build.md) |
| GitHub Pages deploy or the editor's Cloudflare Workers/OpenNext deploy | [hosting.md](hosting.md) |

## Non-negotiable invariants (repo-wide)

- **The editor is a proofing surface, never the source of truth.** The final press PDF
  always comes from `cla-tamara-print`'s LaTeX build.
- **The Markdown round-trip is load-bearing.** Any change to the schema, markdown-it
  rules, or serializer must preserve byte-for-byte-equivalent round-trips for existing
  `cla-clq` articles — see the round-trip subskill before touching any of this.
- **The GitHub token is never persisted.** Only repo/path/branch go to `localStorage`;
  the token stays in memory (component state) only.
- **The public site never invents content.** `site/build-site.py` only presents what's
  in `issues.json` / the `cla-clq` index; issue PDFs are subscriber-gated, not published.
- Per repo `CLAUDE.md`: every function/lib/file carries a header comment, and any code
  change **must** update `.claude/skills/` in the same change.
