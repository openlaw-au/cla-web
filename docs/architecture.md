# cla-web — architecture

## Two jobs

1. **Publish CLQ.** Pull built issues from `openlaw-au/cla-clq` (PDF + metadata) and present
   a public issue list and per-article reading view, with the PDF as the canonical download.
2. **Proof editing (ProseMirror).** Give editors a WYSIWYG surface for final corrections
   that never exposes LaTeX.

## Proofing round-trip

```
author .docx ──pandoc──▶ Markdown/pandoc-JSON  ◀──edit──  ProseMirror editor
                                   │
                                save
                                   ▼
                     cla-tamara-print pipeline  ──lualatex──▶  press PDF
```

- **Canonical source** while proofing is the Markdown/JSON, not the `.tex`. The LaTeX is a
  render target.
- **Fidelity checklist** for the schema + converters: footnotes, italic case names, small
  caps, defined terms, block quotes, the run-in headings, and the index tags
  (`\idxcase` etc.) must survive editing and round-trip cleanly.
- **Versioning:** each save is a commit in `cla-clq` (or a PR), so proof history is tracked.

## Alternatives considered

- **Overleaf Visual Editor** — near-WYSIWYG on the actual LaTeX, GitHub-synced, zero
  round-trip loss. Still a fine zero-build interim proofing surface where the bespoke
  editor is overkill (see `docs/overleaf.md`).
- **Typst** — faster compile, friendlier source, but a second typesetting engine to maintain
  — not pursued.

## Stack

- **Front end:** `editor/` is a **Next.js 16 + React 19 + TypeScript** app (App Router).
  `app/layout.tsx` + `app/page.tsx` are the server-rendered shell; the ProseMirror
  `EditorView` itself lives in the `'use client'` `components/ProofingEditor.tsx`
  component (ProseMirror's view layer is imperative DOM, not JSX, so it is constructed
  inside a `useEffect` and torn down on unmount). Typed conversion/parsing logic is
  factored into `lib/editor/*` modules — `schema.ts` (ProseMirror schema, incl. the
  `smallcaps` mark and `footnote` node), `markdown.ts` (parser + serializer),
  `preprocess.ts` (reference-footnote → inline expansion before parsing),
  `commands.ts` (toolbar commands/keymap), `footnote-view.ts` (the footnote `NodeView` +
  numbering), and `github.ts` (the GitHub contents-API client for load/save). Every
  module is unit-tested (Vitest) at 100% coverage; `npm run test:e2e` (Playwright) covers
  the end-to-end load → edit → save round-trip.
- **Build service:** none needed — the press build always happens in `cla-tamara-print`'s
  own CI (GitHub Actions), triggered by the commits the editor makes to `cla-clq`.
- **Hosting:** the editor deploys via **OpenNext → Cloudflare Workers**
  (`open-next.config.ts`, `wrangler.toml`); the public site (`site/`) deploys to GitHub
  Pages via `.github/workflows/pages.yml`.
