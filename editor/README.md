# CLQ Proofing Editor (v0)

A self-contained, browser-based **ProseMirror** editor for final proof editing of CLQ
articles — so editors work in rich text, never in LaTeX. It round-trips Markdown, including
footnotes, which is the format the production pipeline consumes.

## Run it

It's a single static file — no build step. Because it loads ProseMirror from a CDN, it needs
an internet connection the first time.

```bash
# from this folder:
python3 -m http.server 8080
# then open http://localhost:8080/
```

(Opening `index.html` directly via `file://` will not work — ES-module import maps need an
`http(s)` origin. Any static server, or GitHub Pages, is fine.)

## What it does

- **Load** an article's Markdown (paste into the right-hand box → *Load into editor*). Both
  reference footnotes `[^1]` … `[^1]: text` and pandoc inline footnotes `^[text]` are
  accepted.
- **Edit** in rich text: headings (H1–H3), bold, italic (case names), block quotes, bullet
  and numbered lists, and footnotes. Footnotes show as navy superscripts; click one to edit
  its text in the side panel.
- **Export** back to Markdown (*Export Markdown* / *Download .md*). Footnotes are written as
  pandoc inline notes `^[…]`, which `cla-tamara-print`'s pipeline turns into `\footnote{…}`.

## Where it fits

```
author .docx ──pandoc──▶ Markdown  ──load──▶  [ this editor ]  ──export──▶ Markdown
                                                                              │
                                                              cla-tamara-print pipeline
                                                                              ▼
                                                                       press PDF (CI)
```

The editor is the **proofing surface**, never the source of truth for the final PDF — that
is always the LaTeX build in `cla-tamara-print`.

## Status & roadmap (v0)

Working: the constructs above and the footnote round-trip. This is a scaffold, deliberately
minimal. Known gaps to close before it's production-grade:

- Small-caps and defined-term styling; tables.
- Multi-paragraph footnotes (v0 treats a footnote as a single inline chunk).
- Track-changes / comments for editorial review (or drive review through PRs in `cla-clq`).
- Persistence: wire *Load*/*Export* to a `cla-clq` article via the GitHub API instead of
  copy-paste.
- A test pass to confirm the CDN module versions resolve cleanly in your browsers; if a
  dependency needs pinning, adjust the import map at the top of `index.html`.

Until those land, **`docs/overleaf.md`** is the recommended interim proofing surface — it
works today and can't drift from the LaTeX.
