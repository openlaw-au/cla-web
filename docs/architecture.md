# cla-web — architecture (proposed)

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
  round-trip loss. Lowest effort; good interim option before the bespoke editor exists.
- **Typst** — faster compile, friendlier source, but a second typesetting engine to maintain.

## Stack (to decide)

- Front end: ProseMirror + a thin app (SvelteKit / Next).
- Build service: a small worker that runs the `cla-tamara-print` pipeline on demand
  (or GitHub Actions via `workflow_dispatch`).
- Hosting: TBD (static issue site + a build endpoint).
