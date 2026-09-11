# cla-web

Websites for the **Commercial Law Association of Australia** — hosting the Commercial Law
Quarterly and providing a browser-based surface for final proof editing.

## Contents

- **`editor/`** — the **CLQ Proofing Editor** (v0): a self-contained ProseMirror app that
  round-trips Markdown (headings, italics, bold, quotes, lists, footnotes) so editors proof
  in rich text, never in LaTeX. See `editor/README.md`.
- **`docs/overleaf.md`** — the **interim proofing surface**: Overleaf's Visual Editor synced
  to `cla-clq`. Works today, zero build, can't drift from the LaTeX. Recommended until the
  ProseMirror editor is production-grade.
- **`docs/architecture.md`** — the overall design (CLQ hosting + the proofing round-trip).

## Two jobs

1. **Publish CLQ** — present built issues from `openlaw-au/cla-clq` (PDF + a web reading
   view).
2. **Proof editing** — let editors correct copy without touching LaTeX; the press build
   always happens in `cla-tamara-print`'s CI.

## Status

Editor is a working v0 scaffold; hosting is still to be built. Repo is private until the
site is ready — then `gh repo edit openlaw-au/cla-web --visibility public`.
