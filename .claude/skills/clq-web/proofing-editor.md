---
name: proofing-editor
description: Use when working on the CLQ Proofing Editor's ProseMirror schema, toolbar/commands/keymap, footnote UI, or GitHub load/save persistence — the Next.js 16 + React 19 + TypeScript app (components/ProofingEditor.tsx, lib/editor/*).
---

# Proofing Editor

## Overview

A browser rich-text (ProseMirror) editor so CLQ editors proof articles without touching
LaTeX. A **Next.js 16 + React 19 + TypeScript** app (App Router):
`components/ProofingEditor.tsx` hosts the `'use client'` ProseMirror `EditorView`; typed
conversion/parsing logic lives in `lib/editor/*` modules (schema, markdown-it rules,
serializer, GitHub client). The behaviour below is the load-bearing contract this app
implements — preserve it across any change.

**REQUIRED SUB-SKILL for any change touching parsing/serializing:** load
[proofing-editor/markdown-roundtrip.md](proofing-editor/markdown-roundtrip.md) first. It
is the precise, load-bearing round-trip contract; this file only covers schema, UI, and
persistence.

## Schema

Built from `prosemirror-schema-basic` + `prosemirror-schema-list`, plus two additions:

- **`smallcaps` mark** — added to the basic mark set. DOM: `<span class="clq-sc">`
  (`font-variant: small-caps`). Parses from `span.clq-sc` or any element whose
  `font-variant` style matches `/small-caps/`. Toggle: `SC` toolbar button or `Shift-Mod-c`.
- **`footnote` node** — inline, atom, selectable, not draggable; group `"inline"`; one
  attr `text` (default `""`). DOM: `<sup class="clq-fn" title="{text}">fn</sup>`. Parses
  from `sup.clq-fn`, reading `text` back from the `title` attribute.

Lists use the standard `addListNodes(basic.spec.nodes, "paragraph block*", "block")`
content expression — nothing custom there.

## Footnote behaviour (FootnoteView + numbering)

Footnotes are edited through a **node view + side panel**, not inline text:

- `FootnoteView` renders the atom as `<sup class="clq-fn">fn</sup>`; `mousedown` selects
  the node (`NodeSelection`) instead of placing a cursor inside it (`stopEvent()` and
  `ignoreMutation()` both return `true` — the DOM is display-only, never directly edited).
- Selecting a footnote node populates a side-panel textarea (`$fn` / `fnText`) with
  `node.attrs.text` and focuses it. Typing in the textarea dispatches
  `setNodeMarkup(pos, null, {text: newValue})` with `addToHistory: true` — so footnote
  edits are undoable.
- The node view adds CSS class `multi` when `node.attrs.text` contains a blank line
  (`/\n\s*\n/`) — the UI styles multi-paragraph footnotes differently (amber) so editors
  can tell inline-vs-reference-note footnotes apart at a glance. **A blank line inside
  the footnote text is what promotes it to a multi-paragraph reference note on export**
  (see round-trip subskill) — that's how an editor converts one kind to the other.
- A separate `numberPlugin` renumbers every `sup.clq-fn` in **document order** after each
  view update (pure DOM text content — not stored in the node's attrs). Numbering is
  therefore always derived, never a source of truth to preserve across edits.
- Toolbar "Footnote" button inserts a new footnote atom with `text: "New footnote."` at
  the current selection.

`FootnoteView` is a ProseMirror `NodeView` class constructed imperatively inside the
`'use client'` component (ProseMirror's view layer is not React JSX) — the side panel
textarea is a React-controlled `<textarea>` whose `onChange` dispatches `setNodeMarkup`
with `addToHistory: true`.

## Toolbar, commands, keymap

Toolbar buttons dispatch ProseMirror commands directly against `view.state`/`view.dispatch`
(`mousedown` with `preventDefault()` so focus never leaves the editor):

| Button | Command |
|---|---|
| Bold / Italic / SC | `toggleMark(strong\|em\|smallcaps)` |
| H1 / H2 / H3 | `setBlockType(heading, {level})` |
| ¶ | `setBlockType(paragraph)` |
| Quote | `wrapIn(blockquote)` |
| • List / 1. List | `wrapInList(bullet_list \| ordered_list)` |
| Footnote | `insertFootnote` (custom, above) |
| Undo / Redo | `undo` / `redo` |

Keymap (`Mod` = Cmd/Ctrl):

| Keys | Action |
|---|---|
| `Mod-b` / `Mod-i` | bold / italic |
| `Shift-Mod-c` | small caps |
| `Mod-z` | undo |
| `Mod-y`, `Shift-Mod-z` | redo |
| `Enter` | chained: `splitListItem` → `createParagraphNear` → `liftEmptyBlock` → `splitBlock` |
| `Tab` / `Shift-Tab` | `sinkListItem` / `liftListItem` |

Falls through to `baseKeymap` for everything else standard (arrows, backspace, etc.).

## GitHub persistence contract (JAM-6942)

Load/save an article straight to `cla-clq` via the GitHub **contents API**
(`GET/PUT /repos/{owner}/{name}/contents/{path}`):

- **Fields**: repository (`owner/name`, accepts a pasted `github.com/...` URL and strips
  it), file path, branch (defaults `main`), token.
- **Content encoding**: UTF-8 text ↔ base64 via `TextEncoder`/`TextDecoder` (not naive
  `btoa`/`atob`, which mangle non-ASCII) — `b64encodeUtf8` / `b64decodeUtf8`.
- **Load**: `GET .../contents/{path}?ref={branch}`; stores the returned blob `sha`;
  decodes and feeds `preprocess()` → `parser.parse()` (see round-trip subskill).
- **Save**: `PUT .../contents/{path}` with `{message, content, branch}`, adding `sha` to
  the body **only if a sha was already loaded** (present = update, absent = create).
  Commit message is `"Proof: {path} (CLQ editor)"`. Response's `content.sha` replaces the
  tracked sha so a second save in the same session still updates cleanly. Content sent is
  `serializeDoc(doc) + "\n"` (trailing newline).
- **Persistence split — this is the security-relevant rule**: repo/path/branch are
  remembered in `localStorage` (key `clq-editor-gh`) for convenience across sessions;
  **the token is never written to `localStorage` or anywhere on disk** — component state
  (in-memory) only, cleared on reload. Preserve this split exactly in the rewrite (e.g. a
  token kept in `useState`, never in a persisted store or cookie).
- Errors surface GitHub's JSON `message` field when present, else `response.statusText`,
  prefixed `"GitHub {status}: "`.

Implemented as a typed `lib/editor/github.ts` client with the same three calls (parse
repo string, load, save) and the same in-memory-only token rule.
