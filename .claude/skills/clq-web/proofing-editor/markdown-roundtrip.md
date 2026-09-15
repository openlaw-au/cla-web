---
name: markdown-roundtrip
description: Use when touching the CLQ Proofing Editor's Markdown parsing, serializing, or footnote/small-caps syntax — the exact ^[...]/[^n]/[...]{.smallcaps} rules, the preprocess() reference-to-inline expansion, or anything that must round-trip against cla-clq articles.
---

# Markdown round-trip contract

## Overview

This is the **load-bearing contract** of the proofing editor: an article loaded from
`cla-clq`, edited, and saved back must serialize to Markdown the `cla-tamara-print`
pipeline can still turn into correct LaTeX. Get any rule below wrong and articles corrupt
silently — there's no schema validation catching it. Source of truth: `editor/app.js`
lines ~30–152 (markdown-it rules, parser config, serializer, `preprocess()`).

## The PARA separator invariant

`PARA = " "` (Unicode paragraph separator) is a **private internal marker**, never
written to saved Markdown. It exists because ProseMirror footnote node attrs are a single
string, but multi-paragraph footnote text needs an internal paragraph boundary distinct
from the blank-line boundary used everywhere else in the source Markdown. Two places
touch it:

- `preprocess()` joins a multi-paragraph reference-footnote definition's paragraphs with
  `PARA` before it ever reaches the inline-footnote syntax.
- The parser's `footnote` node spec converts `PARA` back to `"\n\n"` when building the
  node attrs: `getAttrs: t => ({text: t.content.split(PARA).join("\n\n")})`.

So by the time text is inside the ProseMirror doc, footnote text always uses plain
`"\n\n"` for paragraph breaks — `PARA` only exists transiently during the
preprocess→parse handoff. **Never let `PARA` leak into a rendered node attr or saved
file**; if you touch `preprocess()` or the footnote node spec, keep both sides of this
split in sync.

## Two custom inline markdown-it rules

Both registered on `MarkdownIt("commonmark", {html:false})`, both bracket-depth-aware
(handle nested `[...]`):

### `^[...]` — inline footnote (rule `clq_footnote`, before `emphasis`)

Triggers on literal `^[`. Scans forward tracking bracket depth (`[` increments, `]`
decrements) until depth returns to 0 — so `^[see *Smith* [1999] HCA 1]` parses as one
footnote despite the inner `[1999]`. Pushes a single `footnote` token carrying the raw
inner text as `.content`.

### `[...]{.smallcaps}` — small caps span (rule `clq_smallcaps`, before `link`)

Pandoc's native bracketed-span syntax. Triggers on `[`, scans to matching `]` (same
depth-tracking), then requires the literal tail `]{.smallcaps}` immediately after.
Pushes `smallcaps_open` (span, open) / text / `smallcaps_close` (span, close) — i.e. it's
modeled as a mark-like open/close pair, not an atom. **Order matters**: this rule must
stay registered `before("link", ...)` — since both start with `[`, letting `link` run
first would eat the brackets as a (broken) link attempt.

## Serializer rules (ProseMirror doc → Markdown)

`smallcaps` mark serializes as `open:"["`, `close:"]{.smallcaps}"`,
`mixable:false`, `expelEnclosingWhitespace:true` — round-trips exactly.

`footnote` node — the single most important rule in this file:

> **If `node.attrs.text` (trimmed) contains a blank line (`/\n\s*\n/`), serialize as a
> numbered reference footnote (`[^n]`) with a definition block appended after the whole
> document. Otherwise serialize inline (`^[...]`).**

Concretely:
- **Single-paragraph** → `state.text("^[" + text.replace(/\s*\n\s*/g, " ") + "]", false)`
  inline, right where the footnote sits. Internal newlines collapse to spaces.
- **Multi-paragraph** → push the raw trimmed text onto a module-level `_fnDefs` array
  (reset at the start of every `serializeDoc()` call) and emit `[^n]` at the footnote's
  position, where `n` is its 1-based position in `_fnDefs` (**reference numbers are
  assignment order during serialization, unrelated to the on-screen `numberPlugin`
  numbering**, which is purely a DOM display concern — don't conflate the two).

After the main serialize pass, `serializeDoc()` appends one blank line then each
definition as:
```
[^n]: first paragraph text

    second paragraph, indented 4 spaces

    third paragraph, indented 4 spaces
```
i.e. `paras[0]` follows `[^n]: ` directly on the same line; every subsequent paragraph is
its own blank-line-separated block indented with 4 spaces. Each paragraph's internal
newlines are collapsed to spaces first.

## `preprocess()` — reference footnotes → inline, before parsing

The parser only understands the inline `^[...]` syntax (that's the only custom rule
registered) — so **before** any Markdown reaches `md`/`parser.parse()`, `preprocess()`
rewrites every `[^id]: ...` reference-style definition (wherever it appears in the
source, not just at the end) back into the `^[...]` form inline at each `[^id]` usage
site. This is what makes both load-time syntaxes (`^[...]` and `[^n]`/`[^n]: ...`) valid
**input** even though only one is ever produced as **output**.

Algorithm (line-based, operating after normalizing `\r\n?` → `\n`):
1. Scan lines for `/^\[\^([^\]]+)\]:[ \t]*(.*)$/` — a definition line.
2. Collect its first paragraph from the remainder of that line.
3. Continue consuming subsequent lines as long as they're either (a) an indented
   continuation (`/^(\t| {2,})\S/`, dedented and appended with a space to the current
   paragraph) or (b) a blank line **immediately followed by** an indented line (starts a
   new paragraph in the same definition). A blank line NOT followed by indentation ends
   the definition.
4. Join the collected paragraphs with `PARA` and store under `defs[id]`; remove the
   definition's lines from the output entirely.
5. After all definitions are stripped, replace every remaining `[^id]` usage with
   `"^[" + defs[id] + "]"` — i.e. reference syntax becomes inline syntax with `PARA`
   marking internal paragraph breaks, which the parser then converts to `"\n\n"` (see
   invariant above).
6. Collapse 3+ blank lines to 2 and trim.

If `defs[id]` doesn't exist for a `[^id]` occurrence, it's left untouched (`mm` — the
original match) rather than silently dropped.

## Quick reference: syntax round-trip

| Input (load) | ProseMirror | Output (save) |
|---|---|---|
| `^[Some text.]` | footnote node, `text: "Some text."` | `^[Some text.]` (unchanged — no blank line) |
| `[^1]` + `[^1]: Some text.` | footnote node, `text: "Some text."` | `^[Some text.]` (single-paragraph reference → demoted to inline) |
| `[^1]` + `[^1]: Para one.\n\n    Para two.` | footnote node, `text: "Para one.\n\nPara two."` | `[^1]` + `[^1]: Para one.\n\n    Para two.` (re-numbered by serialize order) |
| `[ASIC]{.smallcaps}` | `smallcaps` mark on "ASIC" | `[ASIC]{.smallcaps}` |

**Consequence editors should know**: a reference footnote with only one paragraph is
NOT preserved as `[^n]`/`[^n]:` on save — it round-trips down to inline `^[...]`. Only
footnotes that are genuinely multi-paragraph stay in (equivalent, renumbered) reference
form. This is intentional (inline is simpler when one paragraph suffices) but is a
one-way normalization to be aware of when diffing saves.

## Testing implications for the rewrite

Any `lib/editor/*` port of this logic needs unit tests (Vitest) covering at minimum:
nested brackets inside `^[...]`, `[...]{.smallcaps}` immediately followed by more text,
a `[^id]:` block with 3+ paragraphs (blank-line + indent continuation), a `[^id]` with no
matching definition (left untouched), and the single-paragraph-reference→inline
demotion. Playwright e2e should load a real multi-footnote `cla-clq` article fixture,
round-trip it through load→edit-nothing→save, and diff against the original.
