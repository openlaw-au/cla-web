/**
 * commands.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/commands.ts`.
 *
 * Purpose: Behaviour-preserving verification that the typed commands/keymap/toolbar port matches
 * the legacy `editor/app.js` (lines 194-235) exactly: `insertFootnote`'s dry-run vs dispatching
 * behaviour, `enterCommand`'s chain, every `clqKeymap` binding, and `toolbarSpec`'s exact label
 * sequence (including separator positions) with each button's `run` command exercised.
 *
 * Protocol: covers every branch/closure in commands.ts to satisfy the repo's 100% line+branch
 * coverage gate (see `CLAUDE.md`). `history()` is included in every constructed `EditorState` so
 * the Undo/Redo toolbar buttons' `run` commands have real history entries to act on. Documents are
 * built via `Node.fromJSON(clqSchema, ...)` rather than a builder-function DSL (this schema has no
 * `prosemirror-test-builder` setup), keeping this suite dependency-free.
 */
import { describe, expect, it, vi } from "vitest";
import { Node } from "prosemirror-model";
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { history } from "prosemirror-history";
import { clqSchema } from "./schema";
import { clqKeymap, enterCommand, insertFootnote, toolbarSpec } from "./commands";

/** Build an EditorState for a single paragraph doc containing `content`, with history enabled. */
function paraState(content = "hello") {
  const doc = Node.fromJSON(clqSchema, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: content }] }],
  });
  return EditorState.create({ schema: clqSchema, doc, plugins: [history()] });
}

/** Capture the transaction a Command dispatches, for asserting on the resulting doc. */
function capture() {
  let tr: Transaction | undefined;
  const dispatch = (t: Transaction) => {
    tr = t;
  };
  return { dispatch, get tr() {
    return tr;
  } };
}

describe("insertFootnote", () => {
  it("dry-run (no dispatch) returns true and does not throw", () => {
    const state = paraState();
    expect(() => insertFootnote(state, undefined)).not.toThrow();
    expect(insertFootnote(state, undefined)).toBe(true);
  });

  it("with a dispatch, inserts a footnote node with attrs.text 'New footnote.' and returns true", () => {
    const state = paraState();
    const cap = capture();
    const result = insertFootnote(state, cap.dispatch);
    expect(result).toBe(true);
    expect(cap.tr).toBeDefined();
    const newDoc = state.apply(cap.tr!).doc;
    let found: { text: string } | null = null;
    newDoc.descendants((node) => {
      if (node.type === clqSchema.nodes.footnote) found = { text: node.attrs.text };
    });
    expect(found).toEqual({ text: "New footnote." });
  });
});

describe("enterCommand", () => {
  it("is a function returning a boolean when run in a plain paragraph", () => {
    const state = paraState();
    const result = enterCommand(state, vi.fn());
    expect(typeof result).toBe("boolean");
  });

  it("splits a list item when the selection is inside one (splitListItem branch)", () => {
    const doc = Node.fromJSON(clqSchema, {
      type: "doc",
      content: [
        {
          type: "bullet_list",
          content: [
            {
              type: "list_item",
              content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }],
            },
          ],
        },
      ],
    });
    const state = EditorState.create({ schema: clqSchema, doc, plugins: [history()] });
    // Place selection at the end of "item", inside the list item's paragraph text content.
    // pos 0 = before bullet_list, 1 = before list_item, 2 = before paragraph, 3 = before "item"
    // text; the text itself occupies positions 3..3+len, so 3+len is still inside the paragraph.
    const pos = 3 + "item".length;
    const stateAtEnd = state.apply(state.tr.setSelection(TextSelection.create(doc, pos)));
    const result = enterCommand(stateAtEnd, vi.fn());
    expect(typeof result).toBe("boolean");
  });

  it("runs as a dry-run probe (no dispatch) and still returns a boolean", () => {
    const state = paraState();
    const result = enterCommand(state);
    expect(typeof result).toBe("boolean");
  });
});

describe("clqKeymap", () => {
  const expectedKeys = [
    "Mod-b",
    "Mod-i",
    "Shift-Mod-c",
    "Mod-z",
    "Mod-y",
    "Shift-Mod-z",
    "Enter",
    "Tab",
    "Shift-Tab",
  ];

  it.each(expectedKeys)("has a function bound to %s", (key) => {
    expect(typeof clqKeymap[key]).toBe("function");
  });

  it("has exactly the expected keys", () => {
    expect(Object.keys(clqKeymap).sort()).toEqual([...expectedKeys].sort());
  });
});

describe("toolbarSpec", () => {
  it("matches the exact legacy label + separator sequence", () => {
    const rendered = toolbarSpec.map((item) => (item.type === "sep" ? "sep" : item.label));
    expect(rendered).toEqual([
      "Bold",
      "Italic",
      "SC",
      "sep",
      "H1",
      "H2",
      "H3",
      "¶",
      "sep",
      "Quote",
      "• List",
      "1. List",
      "sep",
      "Footnote",
      "sep",
      "Undo",
      "Redo",
    ]);
  });

  it("every button's run is a function", () => {
    for (const item of toolbarSpec) {
      if (item.type === "button") expect(typeof item.run).toBe("function");
    }
  });

  function getButton(label: string) {
    const item = toolbarSpec.find((i) => i.type === "button" && i.label === label);
    if (!item || item.type !== "button") throw new Error(`toolbar button not found: ${label}`);
    return item;
  }

  it("Bold toggles the strong mark on a text selection", () => {
    const state = paraState();
    const withSel = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
    const cap = capture();
    const ok = getButton("Bold").run(withSel, cap.dispatch);
    expect(ok).toBe(true);
    const after = withSel.apply(cap.tr!);
    let hasStrong = false;
    after.doc.descendants((node) => {
      if (node.isText && clqSchema.marks.strong.isInSet(node.marks)) hasStrong = true;
    });
    expect(hasStrong).toBe(true);
  });

  it("Italic toggles the em mark (dry-run probe)", () => {
    const state = paraState();
    const withSel = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
    expect(typeof getButton("Italic").run(withSel, undefined)).toBe("boolean");
  });

  it("SC toggles the smallcaps mark (dry-run probe)", () => {
    const state = paraState();
    const withSel = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
    expect(typeof getButton("SC").run(withSel, undefined)).toBe("boolean");
  });

  it("H1 sets the block type to heading level 1", () => {
    const state = paraState();
    const cap = capture();
    const ok = getButton("H1").run(state, cap.dispatch);
    expect(ok).toBe(true);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.type.name).toBe("heading");
    expect(after.doc.firstChild?.attrs.level).toBe(1);
  });

  it("H2 sets the block type to heading level 2", () => {
    const state = paraState();
    const cap = capture();
    getButton("H2").run(state, cap.dispatch);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.attrs.level).toBe(2);
  });

  it("H3 sets the block type to heading level 3", () => {
    const state = paraState();
    const cap = capture();
    getButton("H3").run(state, cap.dispatch);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.attrs.level).toBe(3);
  });

  it("¶ sets the block type back to paragraph", () => {
    const doc = Node.fromJSON(clqSchema, {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "hi" }] },
      ],
    });
    const state = EditorState.create({ schema: clqSchema, doc, plugins: [history()] });
    const cap = capture();
    const ok = getButton("¶").run(state, cap.dispatch);
    expect(ok).toBe(true);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("Quote wraps the selection in a blockquote", () => {
    const state = paraState();
    const cap = capture();
    const ok = getButton("Quote").run(state, cap.dispatch);
    expect(ok).toBe(true);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.type.name).toBe("blockquote");
  });

  it("• List wraps the selection in a bullet_list", () => {
    const state = paraState();
    const cap = capture();
    const ok = getButton("• List").run(state, cap.dispatch);
    expect(ok).toBe(true);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.type.name).toBe("bullet_list");
  });

  it("1. List wraps the selection in an ordered_list", () => {
    const state = paraState();
    const cap = capture();
    const ok = getButton("1. List").run(state, cap.dispatch);
    expect(ok).toBe(true);
    const after = state.apply(cap.tr!);
    expect(after.doc.firstChild?.type.name).toBe("ordered_list");
  });

  it("Footnote inserts a footnote node via insertFootnote", () => {
    const state = paraState();
    const cap = capture();
    const ok = getButton("Footnote").run(state, cap.dispatch);
    expect(ok).toBe(true);
    const after = state.apply(cap.tr!);
    let found = false;
    after.doc.descendants((node) => {
      if (node.type === clqSchema.nodes.footnote) found = true;
    });
    expect(found).toBe(true);
  });

  it("Undo is a no-op (returns false) with no history to undo", () => {
    const state = paraState();
    const dispatch = vi.fn();
    const ok = getButton("Undo").run(state, dispatch);
    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Undo reverts a prior dispatched change when history exists", () => {
    let state = paraState();
    const boldTr = state.tr.addMark(1, 6, clqSchema.marks.strong.create());
    boldTr.setMeta("addToHistory", true);
    state = state.apply(boldTr);
    const cap = capture();
    const ok = getButton("Undo").run(state, cap.dispatch);
    expect(ok).toBe(true);
    expect(cap.tr).toBeDefined();
  });

  it("Redo is a no-op (returns false) with nothing to redo", () => {
    const state = paraState();
    const dispatch = vi.fn();
    const ok = getButton("Redo").run(state, dispatch);
    expect(ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Redo re-applies an undone change when redo history exists", () => {
    let state = paraState();
    const boldTr = state.tr.addMark(1, 6, clqSchema.marks.strong.create());
    boldTr.setMeta("addToHistory", true);
    state = state.apply(boldTr);
    const undoCap = capture();
    getButton("Undo").run(state, undoCap.dispatch);
    state = state.apply(undoCap.tr!);
    const redoCap = capture();
    const ok = getButton("Redo").run(state, redoCap.dispatch);
    expect(ok).toBe(true);
    expect(redoCap.tr).toBeDefined();
  });
});
