/**
 * numbering.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/numbering.ts`.
 *
 * Purpose: Verifies `renumberFootnotes` renumbers `sup.clq-fn` elements in document order
 * (1-based, overwriting any prior textContent), handles the empty/no-match case as a no-op, and
 * that `numberingPlugin` is a view-only ProseMirror `Plugin` whose `view(...).update(...)` calls
 * through to `renumberFootnotes` against the given `EditorView`'s `dom`.
 *
 * Protocol: covers every branch in numbering.ts to satisfy the repo's 100% line+branch coverage
 * gate (see `CLAUDE.md`).
 */
import { describe, expect, it } from "vitest";
import { numberingPlugin, renumberFootnotes } from "./numbering";

describe("renumberFootnotes", () => {
  it("numbers 3 sup.clq-fn elements 1, 2, 3 in document order", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<p>a<sup class="clq-fn">fn</sup>b<sup class="clq-fn">fn</sup>c<sup class="clq-fn">fn</sup></p>';
    renumberFootnotes(root);
    const sups = root.querySelectorAll("sup.clq-fn");
    expect(Array.from(sups).map((el) => el.textContent)).toEqual(["1", "2", "3"]);
  });

  it("is a no-op on a dom with no sup.clq-fn elements", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>no footnotes here</p>";
    expect(() => renumberFootnotes(root)).not.toThrow();
    expect(root.querySelectorAll("sup.clq-fn").length).toBe(0);
  });

  it("overwrites stale textContent (e.g. after a footnote is removed)", () => {
    const root = document.createElement("div");
    root.innerHTML = '<sup class="clq-fn">7</sup><sup class="clq-fn">9</sup>';
    renumberFootnotes(root);
    const sups = root.querySelectorAll("sup.clq-fn");
    expect(Array.from(sups).map((el) => el.textContent)).toEqual(["1", "2"]);
  });
});

describe("numberingPlugin", () => {
  it("is a Plugin whose view().update(view) renumbers view.dom's footnotes", () => {
    const dom = document.createElement("div");
    dom.innerHTML = '<sup class="clq-fn">fn</sup><sup class="clq-fn">fn</sup>';
    // A minimal fake EditorView carrying only what the plugin's view.update reads: `.dom`.
    const fakeView = { dom } as unknown as import("prosemirror-view").EditorView;

    const pluginView = numberingPlugin.spec.view?.(fakeView);
    expect(pluginView).toBeDefined();
    pluginView?.update?.(fakeView, fakeView.state);

    const sups = dom.querySelectorAll("sup.clq-fn");
    expect(Array.from(sups).map((el) => el.textContent)).toEqual(["1", "2"]);
  });
});
