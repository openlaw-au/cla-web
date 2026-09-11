# Interim proofing surface: Overleaf ↔ GitHub

Until the ProseMirror editor (`editor/`) is production-ready, editors can proof CLQ in
**Overleaf's Visual Editor** — a near-WYSIWYG view of the *actual* LaTeX, with zero
round-trip loss because it edits the source directly. It syncs to GitHub, so proof changes
land as commits.

## One-time setup

1. **Connect GitHub to Overleaf** — in Overleaf: *Account Settings → GitHub → Link*.
2. **Import the issue repo** — *New Project → Import from GitHub → `openlaw-au/cla-clq`*
   (the content repo). Overleaf creates a project mirrored to the repo.
3. **Set the compiler to LuaLaTeX** — *Menu → Compiler → LuaLaTeX* (required for the
   microtype expansion the design relies on). Set the main document to the issue's
   `issue.tex`.
4. **Fonts.** Two choices:
   - *Faithful proofing* — upload the `CLQ-fonts/System1-…` OTFs into a `fonts/` folder in
     the Overleaf project. The project is private; this is the same as any build machine
     holding the licences. Nothing changes in the class.
   - *Content-only proofing* — if you'd rather not upload the licensed fonts, proof with
     free stand-ins: they don't affect the words, only the look. (Ask for a `[free]` class
     switch if you want this wired in.)

## The proofing loop

1. Editor opens the project in Overleaf and switches to the **Visual Editor** (top-left
   toggle). Headings, italics (case names), footnotes and block quotes all render inline.
2. They make corrections; Overleaf recompiles to the exact press PDF.
3. **Menu → GitHub → Push** sends the changes back to `cla-clq` as a commit (or open a PR
   for editorial review).
4. The **press build** still happens in CI (`cla-tamara-print`) with the licensed fonts, so
   Overleaf is only ever the proofing surface, never the source of truth for the final PDF.

## Why this, before the bespoke editor

It works today, with no build, and it can't drift from the LaTeX because it *is* the LaTeX.
The ProseMirror editor is the nicer long-term surface for non-technical proofers (no LaTeX
at all), but it carries a real round-trip-fidelity burden; Overleaf carries none.
