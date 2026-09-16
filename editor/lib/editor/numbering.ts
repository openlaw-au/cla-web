/**
 * numbering.ts
 *
 * Usage scope: The CLQ Proofing Editor's footnote auto-numbering ProseMirror plugin — imported by
 * the `ProofingEditor` React component's plugin list alongside `history()`/`keymap()`.
 *
 * Purpose: Typed, behaviour-preserving port of `numberPlugin` previously inlined in the legacy
 * `editor/app.js` (lines 189-191). ProseMirror's `footnote` atom node (see `schema.ts`) renders a
 * literal `"fn"` label via its `toDOM` spec — the visible "1", "2", "3", ..." numbering shown to
 * proofreaders is a purely presentational overlay applied after every view update, walking the
 * mounted DOM in document order and overwriting each `sup.clq-fn` element's `textContent`. This
 * keeps numbering out of the schema/document model entirely (a footnote's `text` attr never
 * encodes its own number), so document-order edits (inserting/deleting/reordering footnotes)
 * renumber for free on the next render.
 *
 * The renumbering walk itself is split out as {@link renumberFootnotes}, a small DOM-only
 * function with no ProseMirror dependency, so it can be unit-tested directly against a plain
 * jsdom fragment instead of only indirectly through a mounted `EditorView`.
 *
 * Protocol: keep this module's behaviour in lockstep with the legacy `editor/app.js` (lines
 * 189-191) — same selector (`sup.clq-fn`), same document-order 1-based numbering, same
 * "renumber on every view update" trigger — until that file is removed; any divergence changes
 * the numbers proofreaders see next to each footnote. Do not modify `editor/app.js` or
 * `schema.ts`.
 */
import { Plugin, type PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Renumbers every `sup.clq-fn` element found (in document order) within `dom`, setting each
 * element's `textContent` to its 1-based position among all such elements. A `dom` containing no
 * `sup.clq-fn` elements is a no-op.
 *
 * Pure DOM function — takes no ProseMirror types — so {@link numberingPlugin}'s `view.update` and
 * unit tests can both call it directly against any `HTMLElement` (a real mounted editor's root,
 * or a bare jsdom fragment built for a test).
 *
 * @param dom The element to search within (typically the `EditorView`'s root DOM node).
 */
export function renumberFootnotes(dom: HTMLElement): void {
  let n = 0;
  dom.querySelectorAll("sup.clq-fn").forEach((el) => {
    el.textContent = String(++n);
  });
}

/**
 * The CLQ Proofing Editor's footnote-numbering plugin: a view-only ProseMirror `Plugin` (it
 * contributes no state field, transaction handling, or props — only a `view` lifecycle hook) that
 * calls {@link renumberFootnotes} on the view's root DOM node after every editor update. Ported
 * unchanged from `editor/app.js` lines 189-191.
 */
export const numberingPlugin: Plugin = new Plugin({
  view(): PluginView {
    return {
      update(v: EditorView) {
        renumberFootnotes(v.dom as HTMLElement);
      },
    };
  },
});
