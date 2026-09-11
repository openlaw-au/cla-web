# cla-web

Websites for the **Commercial Law Association of Australia** — hosting the Commercial Law
Quarterly and providing a browser-based **ProseMirror** editor for final proof editing.

## Scope

- **CLQ hosting** — publish each issue (PDF + a web reading view) from `cla-clq`.
- **ProseMirror proofing** — a rich-text editor for editors to make final proof changes
  without touching LaTeX. Article stored as Markdown / pandoc-JSON; on save, the pipeline in
  `cla-tamara-print` renders LaTeX → PDF. Round-trip fidelity (footnotes, italic case names,
  small caps) is the thing to get right.

## Status

Scaffold only. See `docs/architecture.md` for the proposed stack and the proofing
round-trip design. Repo is private until the site is ready; then:

```bash
gh repo edit openlaw-au/cla-web --visibility public
```
