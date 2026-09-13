# CLQ Proofing Editor (v0.2)

A self-contained, browser-based **ProseMirror** editor for final proof editing of CLQ
articles — so editors work in rich text, never in LaTeX. It round-trips Markdown (the format
the production pipeline consumes), including footnotes and small caps, and can load and save
an article straight to `cla-clq` via the GitHub API.

## Run it

`index.html` loads ProseMirror from a CDN, so it needs an internet connection the first time.
`index_local.html` + `bundle.js` are a self-contained offline build (see `BUILD.md`).

```bash
# from this folder:
python3 -m http.server 8080
# then open http://localhost:8080/            (CDN build)
#         or http://localhost:8080/index_local.html   (offline build)
```

(Opening the files via `file://` will not work — ES-module scripts need an `http(s)` origin.
Any static server, or GitHub Pages, is fine.)

## What it does

- **Load** an article's Markdown — either paste it (right-hand box → *Load into editor*) or
  pull it from `cla-clq` (the **GitHub** panel). Reference footnotes `[^1]` … `[^1]: text`
  (including **multi-paragraph** notes with indented continuation paragraphs) and pandoc
  inline footnotes `^[text]` are both accepted.
- **Edit** in rich text: headings (H1–H3), **bold**, *italic* (case names), **small caps**
  (`SC` button / ⇧⌘C — for defined terms and acronyms), block quotes, bullet and numbered
  lists, and footnotes. Footnotes show as superscripts (amber when multi-paragraph); click one
  to edit its text — leave a blank line to make it a multi-paragraph note.
- **Save** back to `cla-clq` (*Save to GitHub*) — each save is a commit — or **Export**
  Markdown (*Export Markdown* / *Download .md*). Small caps export as pandoc
  `[text]{.smallcaps}`; single-paragraph footnotes as inline `^[…]`; multi-paragraph
  footnotes as numbered reference notes `[^n]` with an indented block. The `cla-tamara-print`
  pipeline turns all of these into the right LaTeX (`\textsc{…}`, `\footnote{…}`).

## GitHub load / save

In the **GitHub** panel: set *Repository* (`openlaw-au/cla-clq`), *File path*
(e.g. `issues/2026-Vol40-No3/src/peden_body.tex`), *Branch* (`main`), and a **token** with
repo scope (a fine-grained PAT scoped to `cla-clq`, or a classic `repo` token). The token is
kept **in memory only** — never written to disk or committed; the repo/path/branch are
remembered in `localStorage` for convenience. *Load* fetches the file (and remembers its blob
sha); *Save* commits your proofed Markdown back with that sha.

## Where it fits

```
author .docx ──pandoc──▶ Markdown  ──load──▶  [ this editor ]  ──save/export──▶ Markdown (cla-clq)
                                                                                     │
                                                                     cla-tamara-print pipeline (CI)
                                                                                     ▼
                                                                              press PDF
```

The editor is the **proofing surface**, never the source of truth for the final PDF — that is
always the LaTeX build in `cla-tamara-print`.

## Status & roadmap

Working: headings, bold, italic, **small caps**, quotes, lists, **footnotes with a
single- and multi-paragraph round-trip**, and **GitHub load/save** to `cla-clq`.

Known gaps still to close:

- **Tables.** By design the pipeline flags tables for hand-setting (they are rare in CLQ
  articles), so the editor does not yet model them; a pasted table should be set by hand in
  the LaTeX. Full in-editor tables (via `prosemirror-tables`) remain a future option.
- **Editorial review** — comments / track-changes (or drive review through `cla-clq` PRs).
- A cross-browser test pass on the pinned CDN module versions.

`docs/overleaf.md` remains a fine interim proofing surface where a zero-build option is
wanted.
