/**
 * schema.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/schema.ts`.
 *
 * Purpose: Behaviour-preserving verification that the typed CLQ ProseMirror schema matches the
 * legacy `editor/app.js` (lines 14-28) exactly — the `smallcaps` mark's parseDOM/toDOM, the
 * `footnote` atom node's parseDOM/toDOM and default attrs, that `addListNodes` ran (basic list
 * nodes present), and the `PARA` separator constant.
 *
 * Protocol: covers every branch in schema.ts (smallcaps style getAttrs regex match vs no-match;
 * footnote parseDOM getAttrs title-present vs title-absent) to satisfy the repo's 100%
 * line+branch coverage gate (see `CLAUDE.md`).
 */
import { describe, expect, it } from "vitest";
import { PARA, clqSchema } from "./schema";

describe("PARA", () => {
  it("is the U+2029 private paragraph separator", () => {
    expect(PARA).toBe(" ");
  });
});

describe("clqSchema smallcaps mark", () => {
  it("exists on the schema", () => {
    expect(clqSchema.marks.smallcaps).toBeDefined();
  });

  it("toDOM renders a span.clq-sc wrapping the mark content", () => {
    const mark = clqSchema.marks.smallcaps.create();
    expect(mark.type.spec.toDOM?.(mark, true)).toEqual(["span", { class: "clq-sc" }, 0]);
  });

  it("parseDOM has a tag rule matching span.clq-sc", () => {
    const rules = clqSchema.marks.smallcaps.spec.parseDOM ?? [];
    const tagRule = rules.find((r): r is typeof rules[number] & { tag: string } => "tag" in r && r.tag === "span.clq-sc");
    expect(tagRule).toBeDefined();
  });

  it("parseDOM style rule getAttrs returns null when the style value matches small-caps", () => {
    const rules = clqSchema.marks.smallcaps.spec.parseDOM ?? [];
    const styleRule = rules.find((r) => "style" in r && r.style === "font-variant");
    expect(styleRule).toBeDefined();
    const getAttrs = (styleRule as { getAttrs?: (v: string) => unknown }).getAttrs;
    expect(getAttrs?.("small-caps")).toBeNull();
  });

  it("parseDOM style rule getAttrs returns false when the style value does not match small-caps", () => {
    const rules = clqSchema.marks.smallcaps.spec.parseDOM ?? [];
    const styleRule = rules.find((r) => "style" in r && r.style === "font-variant");
    const getAttrs = (styleRule as { getAttrs?: (v: string) => unknown }).getAttrs;
    expect(getAttrs?.("normal")).toBe(false);
  });
});

describe("clqSchema footnote node", () => {
  it("exists, is inline, atom, selectable, not draggable, with a default empty text attr", () => {
    const spec = clqSchema.nodes.footnote.spec;
    expect(clqSchema.nodes.footnote).toBeDefined();
    expect(clqSchema.nodes.footnote.isInline).toBe(true);
    expect(clqSchema.nodes.footnote.isAtom).toBe(true);
    expect(spec.selectable).toBe(true);
    expect(spec.draggable).toBe(false);
    expect(spec.attrs?.text?.default).toBe("");
  });

  it("toDOM renders a sup.clq-fn with a title equal to the node's text attr", () => {
    const node = clqSchema.nodes.footnote.create({ text: "x" });
    expect(node.type.spec.toDOM?.(node)).toEqual(["sup", { class: "clq-fn", title: "x" }, "fn"]);
  });

  it("parseDOM getAttrs reads the title attribute when present", () => {
    const rules = clqSchema.nodes.footnote.spec.parseDOM ?? [];
    const tagRule = rules.find((r) => "tag" in r && r.tag === "sup.clq-fn");
    expect(tagRule).toBeDefined();
    const getAttrs = (tagRule as { getAttrs?: (el: unknown) => unknown }).getAttrs;
    const fakeEl = { getAttribute: (k: string) => (k === "title" ? "hello" : null) };
    expect(getAttrs?.(fakeEl)).toEqual({ text: "hello" });
  });

  it("parseDOM getAttrs defaults to empty text when the title attribute is absent", () => {
    const rules = clqSchema.nodes.footnote.spec.parseDOM ?? [];
    const tagRule = rules.find((r) => "tag" in r && r.tag === "sup.clq-fn");
    const getAttrs = (tagRule as { getAttrs?: (el: unknown) => unknown }).getAttrs;
    const fakeEl = { getAttribute: (_k: string) => null };
    expect(getAttrs?.(fakeEl)).toEqual({ text: "" });
  });
});

describe("clqSchema basic + list nodes (addListNodes ran)", () => {
  it.each(["paragraph", "heading", "blockquote", "bullet_list", "ordered_list", "list_item"])(
    "has the %s node",
    (name) => {
      expect(clqSchema.nodes[name]).toBeDefined();
    },
  );
});

describe("clqSchema footnote node creation flow", () => {
  it("creates a footnote node carrying its text attr, atom + inline", () => {
    const node = clqSchema.nodes.footnote.create({ text: "note" });
    expect(node.attrs.text).toBe("note");
    expect(node.isAtom).toBe(true);
    expect(node.isInline).toBe(true);
  });
});
