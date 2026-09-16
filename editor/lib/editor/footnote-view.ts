/**
 * footnote-view.ts
 *
 * Usage scope: The CLQ Proofing Editor's ProseMirror `NodeView` for the `footnote` atom node —
 * instantiated by the `ProofingEditor` React component's `EditorView` `nodeViews` map (one
 * instance per footnote node in the document).
 *
 * Purpose: Typed, behaviour-preserving port of the `FootnoteView` class previously inlined in the
 * legacy `editor/app.js` (lines 157-180). Renders a `sup.clq-fn` element (the visible, initially
 * "fn"-labelled — see `numbering.ts` for the renumbering overlay — footnote marker) whose `title`
 * attribute carries the footnote's full text and which gains a `.multi` class when that text spans
 * more than one paragraph (a blank line survives trimming, i.e. `/\n\s*\n/`), matching the amber
 * "multi-paragraph → numbered reference note" styling in `app/globals.css`.
 *
 * Selection is handled entirely inside the node view: a `mousedown` on the marker moves the
 * ProseMirror selection to a `NodeSelection` over this node and focuses the view, which in turn
 * triggers ProseMirror's own `selectNode`/`deselectNode` NodeView lifecycle calls — this class
 * does not dispatch to `selectNode`/`deselectNode` directly.
 *
 * Legacy `app.js` held the "which footnote is selected, and what text panel to fill" concern as
 * bare module-level state (`selectedFnPos`, a direct reference to the `#fnText` textarea DOM
 * node) shared across every `FootnoteView` instance. This port removes that global entirely: the
 * constructor instead takes an explicit `FootnoteViewCallbacks` object — `onSelect(pos, text)`,
 * called from `selectNode()` with this node's current document position and text, and
 * `onDeselect()`, called from `deselectNode()` — so the owning React component (`ProofingEditor`)
 * can hold "which footnote is selected" as ordinary component state instead of reaching into a
 * shared global. Each `FootnoteView` instance is otherwise self-contained (no shared state
 * between sibling footnotes).
 *
 * Protocol: keep the DOM shape (`sup.clq-fn`, `title`, `.multi`/`.sel` class toggling), the
 * multi-paragraph regex (`/\n\s*\n/`), and the `stopEvent`/`ignoreMutation` behaviour in lockstep
 * with the legacy `editor/app.js` (lines 157-180) until that file is removed; any divergence
 * changes footnote-editing UX proofreaders already rely on. Do not modify `editor/app.js` or
 * `schema.ts`.
 */
import { NodeSelection } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

/** Regex matching a genuine blank-line paragraph break in a footnote's text attr. */
const MULTI_PARAGRAPH_RE = /\n\s*\n/;

/**
 * Callbacks a {@link FootnoteView} uses to hand "this footnote is now selected/deselected"
 * notifications to its owner, instead of writing to a shared global (see the file header).
 */
export interface FootnoteViewCallbacks {
  /** Called from `selectNode()` with this footnote's current document position and text. */
  onSelect: (pos: number, text: string) => void;
  /** Called from `deselectNode()`. */
  onDeselect: () => void;
}

/**
 * The CLQ Proofing Editor's `NodeView` for the schema's atomic `footnote` inline node. See the
 * file header for the full behaviour contract ported from the legacy `editor/app.js`
 * `FootnoteView` class (lines 157-180).
 */
export class FootnoteView implements NodeView {
  /** The node this view currently renders; kept in sync by {@link update}. */
  node: Node;
  /** The `EditorView` this node view belongs to. */
  view: EditorView;
  /** Resolves this node's current document position; supplied by ProseMirror. */
  getPos: () => number | undefined;
  /** Owner callbacks for selection state — see {@link FootnoteViewCallbacks}. */
  callbacks: FootnoteViewCallbacks;
  /** The rendered `sup.clq-fn` element. */
  dom: HTMLElement;

  constructor(
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
    callbacks: FootnoteViewCallbacks,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.callbacks = callbacks;

    this.dom = document.createElement("sup");
    this.dom.className = "clq-fn";
    this.dom.textContent = "fn";
    this.dom.title = node.attrs.text;
    if (MULTI_PARAGRAPH_RE.test(node.attrs.text)) this.dom.classList.add("multi");

    this.dom.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = this.getPos();
      if (pos == null) return;
      this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
      this.view.focus();
    });
  }

  /**
   * Refreshes this view for a new `node` value (same footnote position, possibly changed attrs).
   * Returns `false` — telling ProseMirror to tear down and recreate the view instead — when
   * `node`'s type no longer matches (ProseMirror's standard `NodeView.update` contract);
   * otherwise updates the `title`/`.multi` class in place and returns `true`.
   */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.dom.title = node.attrs.text;
    this.dom.classList.toggle("multi", MULTI_PARAGRAPH_RE.test(node.attrs.text));
    return true;
  }

  /** ProseMirror NodeView lifecycle: this node became the selection. */
  selectNode(): void {
    this.dom.classList.add("sel");
    const pos = this.getPos();
    if (pos == null) return;
    this.callbacks.onSelect(pos, this.node.attrs.text);
  }

  /** ProseMirror NodeView lifecycle: this node is no longer the selection. */
  deselectNode(): void {
    this.dom.classList.remove("sel");
    this.callbacks.onDeselect();
  }

  /**
   * This node view owns all DOM events on its `dom` (the `mousedown` listener above) — tell
   * ProseMirror not to also try to interpret them itself.
   */
  stopEvent(): boolean {
    return true;
  }

  /**
   * This node view's `dom` never changes except via {@link update} — tell ProseMirror to ignore
   * any DOM mutations it didn't itself cause (e.g. browser-internal changes) rather than trying
   * to reconcile them against the document.
   */
  ignoreMutation(): boolean {
    return true;
  }
}
