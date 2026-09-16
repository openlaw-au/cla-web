/**
 * footnote-view.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/footnote-view.ts`.
 *
 * Purpose: Behaviour-preserving verification that `FootnoteView` matches the legacy
 * `editor/app.js` `FootnoteView` class (lines 157-180): DOM shape (`sup.clq-fn`, title,
 * `.multi`), `update`'s type-match/refresh behaviour, `selectNode`/`deselectNode`'s `.sel` class
 * + callback invocation (`onSelect(pos, text)` / `onDeselect()`, replacing the legacy module
 * globals), `stopEvent`/`ignoreMutation` always `true`, and that a real `mousedown` on the
 * marker — exercised via a real `EditorView` mounted in jsdom over `clqSchema` — moves the
 * selection to a `NodeSelection` over the footnote and triggers the real
 * `selectNode`/`deselectNode` NodeView lifecycle (not called directly).
 *
 * Protocol: covers every branch in footnote-view.ts to satisfy the repo's 100% line+branch
 * coverage gate (see `CLAUDE.md`).
 */
import { describe, expect, it, vi } from "vitest";
import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { clqSchema } from "./schema";
import { FootnoteView, type FootnoteViewCallbacks } from "./footnote-view";

/** Builds a single-footnote document: one paragraph containing just the footnote node. */
function docWithFootnote(text: string) {
  const fn = clqSchema.nodes.footnote.create({ text });
  const para = clqSchema.nodes.paragraph.create(null, fn);
  return clqSchema.nodes.doc.create(null, para);
}

describe("FootnoteView (constructed directly against a fake view/getPos)", () => {
  function makeFakeView() {
    const doc = docWithFootnote("New footnote.");
    const state = EditorState.create({ doc });
    return {
      state,
      dispatch: vi.fn(),
      focus: vi.fn(),
    };
  }

  it("dom is a sup.clq-fn with textContent 'fn' and title set to the node's text", () => {
    const node = clqSchema.nodes.footnote.create({ text: "hello" });
    const fakeView = makeFakeView();
    const onSelect = vi.fn();
    const onDeselect = vi.fn();
    const nv = new FootnoteView(node, fakeView as never, () => 1, { onSelect, onDeselect });

    expect(nv.dom.tagName).toBe("SUP");
    expect(nv.dom.classList.contains("clq-fn")).toBe(true);
    expect(nv.dom.textContent).toBe("fn");
    expect(nv.dom.title).toBe("hello");
    expect(nv.dom.classList.contains("multi")).toBe(false);
  });

  it("adds .multi when the text has a blank-line paragraph break", () => {
    const node = clqSchema.nodes.footnote.create({ text: "para one\n\npara two" });
    const fakeView = makeFakeView();
    const nv = new FootnoteView(node, fakeView as never, () => 1, {
      onSelect: vi.fn(),
      onDeselect: vi.fn(),
    });
    expect(nv.dom.classList.contains("multi")).toBe(true);
  });

  it("update() returns false and does not touch dom when the node type does not match", () => {
    const node = clqSchema.nodes.footnote.create({ text: "hello" });
    const fakeView = makeFakeView();
    const nv = new FootnoteView(node, fakeView as never, () => 1, {
      onSelect: vi.fn(),
      onDeselect: vi.fn(),
    });
    const otherNode = clqSchema.nodes.paragraph.create();
    expect(nv.update(otherNode)).toBe(false);
    // dom untouched by the mismatched update
    expect(nv.dom.title).toBe("hello");
  });

  it("update() returns true and refreshes title + .multi on a matching node", () => {
    const node = clqSchema.nodes.footnote.create({ text: "hello" });
    const fakeView = makeFakeView();
    const nv = new FootnoteView(node, fakeView as never, () => 1, {
      onSelect: vi.fn(),
      onDeselect: vi.fn(),
    });
    const updated = clqSchema.nodes.footnote.create({ text: "a\n\nb" });
    expect(nv.update(updated)).toBe(true);
    expect(nv.node).toBe(updated);
    expect(nv.dom.title).toBe("a\n\nb");
    expect(nv.dom.classList.contains("multi")).toBe(true);

    const backToSingle = clqSchema.nodes.footnote.create({ text: "single" });
    expect(nv.update(backToSingle)).toBe(true);
    expect(nv.dom.classList.contains("multi")).toBe(false);
  });

  it("selectNode adds .sel and calls onSelect(pos, text)", () => {
    const node = clqSchema.nodes.footnote.create({ text: "sel text" });
    const fakeView = makeFakeView();
    const onSelect = vi.fn();
    const nv = new FootnoteView(node, fakeView as never, () => 5, {
      onSelect,
      onDeselect: vi.fn(),
    });
    nv.selectNode();
    expect(nv.dom.classList.contains("sel")).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(5, "sel text");
  });

  it("selectNode does not call onSelect when getPos returns undefined", () => {
    const node = clqSchema.nodes.footnote.create({ text: "x" });
    const fakeView = makeFakeView();
    const onSelect = vi.fn();
    const nv = new FootnoteView(node, fakeView as never, () => undefined, {
      onSelect,
      onDeselect: vi.fn(),
    });
    nv.selectNode();
    expect(nv.dom.classList.contains("sel")).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("deselectNode removes .sel and calls onDeselect", () => {
    const node = clqSchema.nodes.footnote.create({ text: "x" });
    const fakeView = makeFakeView();
    const onDeselect = vi.fn();
    const nv = new FootnoteView(node, fakeView as never, () => 1, {
      onSelect: vi.fn(),
      onDeselect,
    });
    nv.dom.classList.add("sel");
    nv.deselectNode();
    expect(nv.dom.classList.contains("sel")).toBe(false);
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it("stopEvent() returns true", () => {
    const node = clqSchema.nodes.footnote.create({ text: "x" });
    const fakeView = makeFakeView();
    const nv = new FootnoteView(node, fakeView as never, () => 1, {
      onSelect: vi.fn(),
      onDeselect: vi.fn(),
    });
    expect(nv.stopEvent()).toBe(true);
  });

  it("ignoreMutation() returns true", () => {
    const node = clqSchema.nodes.footnote.create({ text: "x" });
    const fakeView = makeFakeView();
    const nv = new FootnoteView(node, fakeView as never, () => 1, {
      onSelect: vi.fn(),
      onDeselect: vi.fn(),
    });
    expect(nv.ignoreMutation()).toBe(true);
  });

  it("mousedown handler is a no-op (besides preventDefault) when getPos returns undefined", () => {
    const node = clqSchema.nodes.footnote.create({ text: "x" });
    const fakeView = makeFakeView();
    const nv = new FootnoteView(node, fakeView as never, () => undefined, {
      onSelect: vi.fn(),
      onDeselect: vi.fn(),
    });
    const evt = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    nv.dom.dispatchEvent(evt);
    expect(fakeView.dispatch).not.toHaveBeenCalled();
    expect(fakeView.focus).not.toHaveBeenCalled();
  });
});

describe("FootnoteView mounted in a real EditorView (real mousedown → selection path)", () => {
  it("mousedown selects the footnote node via NodeSelection and focuses the view", () => {
    const doc = docWithFootnote("real mount");
    const state = EditorState.create({ doc });
    const container = document.createElement("div");
    document.body.appendChild(container);

    let selected: { pos: number; text: string } | null = null;
    let deselected = false;

    const callbacks: FootnoteViewCallbacks = {
      onSelect: (pos, text) => {
        selected = { pos, text };
      },
      onDeselect: () => {
        deselected = true;
      },
    };

    const view = new EditorView(container, {
      state,
      nodeViews: {
        footnote: (node, v, getPos) => new FootnoteView(node, v, getPos, callbacks),
      },
    });

    const focusSpy = vi.spyOn(view, "focus");

    const sup = container.querySelector("sup.clq-fn") as HTMLElement;
    expect(sup).toBeTruthy();

    const evt = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    sup.dispatchEvent(evt);

    // The NodeSelection is now over the footnote node, and ProseMirror's own selectNode lifecycle
    // fired via our node view, invoking onSelect.
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
    expect(selected).not.toBeNull();
    expect(selected!.text).toBe("real mount");
    expect(focusSpy).toHaveBeenCalled();
    expect(sup.classList.contains("sel")).toBe(true);

    // Moving the selection elsewhere triggers deselectNode → onDeselect.
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    expect(deselected).toBe(true);

    view.destroy();
    document.body.removeChild(container);
  });
});
