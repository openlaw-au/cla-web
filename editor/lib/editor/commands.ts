/**
 * commands.ts
 *
 * Usage scope: The CLQ Proofing Editor's ProseMirror commands, keymap, and toolbar spec —
 * imported by the (forthcoming) editor view/component that mounts ProseMirror in the browser and
 * wires up its keyboard shortcuts and toolbar buttons.
 *
 * Purpose: Typed, behaviour-preserving port of the commands, `keys` keymap, and `toolbar` array
 * previously inlined in the legacy `editor/app.js` (lines 194-235). Three exports:
 *   - `insertFootnote`, a ProseMirror `Command` that replaces the current selection with a new
 *     `footnote` atom node seeded with placeholder text.
 *   - `clqKeymap`, the `{[key]: Command}` map handed to `prosemirror-keymap`'s `keymap()` plugin
 *     factory by the editor view (kept as a plain map here, not the plugin itself, so this module
 *     stays view-agnostic and independently testable).
 *   - `toolbarSpec`, a declarative array (`ToolbarItem[]`) describing the toolbar previously built
 *     imperatively in `app.js` by iterating `[label, fn]` pairs and creating DOM buttons inline.
 *     Here each button carries a plain ProseMirror `Command` (`(state, dispatch, view?) =>
 *     boolean`) instead of a closure over `{state, dispatch}`; the React component that renders
 *     this spec is a later task — it will call `run(view.state, view.dispatch)` per button click
 *     and then focus the view, matching the legacy `mousedown` handler's behaviour.
 *
 * Protocol: keep this module in lockstep with the legacy `editor/app.js` (lines 194-235) — same
 * key bindings, same toolbar labels in the same order (including separator positions), same
 * command mapped to each label — until that file is removed; any divergence changes editor
 * behaviour editors already rely on. `insertFootnote` must remain a no-throw dry-run when
 * `dispatch` is omitted (ProseMirror's convention for "can this command apply here?" probes, e.g.
 * from `prosemirror-menu`-style UI that disables buttons whose command returns false).
 */
import {
  chainCommands,
  createParagraphNear,
  liftEmptyBlock,
  setBlockType,
  splitBlock,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { clqSchema } from "./schema";

/**
 * Insert a new `footnote` atom node (seeded with placeholder text "New footnote.") in place of
 * the current selection. Ported unchanged from `editor/app.js` lines 194-198.
 *
 * Like every ProseMirror `Command`, an omitted `dispatch` means "probe only" — no transaction is
 * dispatched, and the command still reports whether it could apply (always `true` here, since a
 * footnote can always replace the current selection).
 */
export function insertFootnote(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  view?: EditorView,
): boolean {
  void view;
  const fn = clqSchema.nodes.footnote.create({ text: "New footnote." });
  if (dispatch) dispatch(state.tr.replaceSelectionWith(fn).scrollIntoView());
  return true;
}

/**
 * The editor's `Enter` key behaviour: split a list item if inside one, else start a new paragraph
 * near a node that doesn't accept text directly, else lift an empty block out of its parent, else
 * split the current block. Ported unchanged from `editor/app.js` line 199.
 */
export const enterCommand: Command = chainCommands(
  splitListItem(clqSchema.nodes.list_item),
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
);

/**
 * The editor's keymap, handed to `prosemirror-keymap`'s `keymap()` plugin factory by the view
 * that mounts this schema. Ported unchanged from `editor/app.js` lines 200-208.
 */
export const clqKeymap: { [key: string]: Command } = {
  "Mod-b": toggleMark(clqSchema.marks.strong),
  "Mod-i": toggleMark(clqSchema.marks.em),
  "Shift-Mod-c": toggleMark(clqSchema.marks.smallcaps),
  "Mod-z": undo,
  "Mod-y": redo,
  "Shift-Mod-z": redo,
  Enter: enterCommand,
  Tab: sinkListItem(clqSchema.nodes.list_item),
  "Shift-Tab": liftListItem(clqSchema.nodes.list_item),
};

/**
 * One entry in the declarative toolbar spec: either a visual separator, or a labelled button
 * backed by a plain ProseMirror `Command`. The rendering component calls `run(view.state,
 * view.dispatch)` on click (mirroring the legacy `mousedown` handler in `editor/app.js` lines
 * 230-235) and then focuses the view.
 */
export type ToolbarItem = { type: "sep" } | { type: "button"; label: string; run: Command };

/**
 * The editor's toolbar, declared data-first instead of the legacy imperative `[label, fn]` array
 * + DOM-building loop in `editor/app.js` lines 210-235. Labels, order, separator positions, and
 * the command each button runs are all preserved exactly.
 */
export const toolbarSpec: ToolbarItem[] = [
  { type: "button", label: "Bold", run: toggleMark(clqSchema.marks.strong) },
  { type: "button", label: "Italic", run: toggleMark(clqSchema.marks.em) },
  { type: "button", label: "SC", run: toggleMark(clqSchema.marks.smallcaps) },
  { type: "sep" },
  { type: "button", label: "H1", run: setBlockType(clqSchema.nodes.heading, { level: 1 }) },
  { type: "button", label: "H2", run: setBlockType(clqSchema.nodes.heading, { level: 2 }) },
  { type: "button", label: "H3", run: setBlockType(clqSchema.nodes.heading, { level: 3 }) },
  { type: "button", label: "¶", run: setBlockType(clqSchema.nodes.paragraph) },
  { type: "sep" },
  { type: "button", label: "Quote", run: wrapIn(clqSchema.nodes.blockquote) },
  { type: "button", label: "• List", run: wrapInList(clqSchema.nodes.bullet_list) },
  { type: "button", label: "1. List", run: wrapInList(clqSchema.nodes.ordered_list) },
  { type: "sep" },
  { type: "button", label: "Footnote", run: insertFootnote },
  { type: "sep" },
  { type: "button", label: "Undo", run: undo },
  { type: "button", label: "Redo", run: redo },
];
