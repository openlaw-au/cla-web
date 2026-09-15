/**
 * schema.ts
 *
 * Usage scope: The CLQ Proofing Editor's ProseMirror document schema — imported by the
 * (forthcoming) markdown parser/serializer modules and the editor view/component that mounts
 * ProseMirror in the browser.
 *
 * Purpose: Typed, behaviour-preserving port of the schema previously inlined in the legacy
 * `editor/app.js` (lines 14-28). It is `prosemirror-schema-basic` + `prosemirror-schema-list`'s
 * `addListNodes` (so paragraphs, headings, blockquotes, and ordered/bullet lists all round-trip),
 * plus two CLQ-specific additions:
 *   - a `smallcaps` mark, for `[text]{.smallcaps}` runs in the source Markdown, rendered as
 *     `<span class="clq-sc">` and recognised either by that class or by an inline
 *     `font-variant: small-caps` style (e.g. when pasting from Word/Google Docs).
 *   - a `footnote` atom node, for `^[...]` inline footnotes, rendered as `<sup class="clq-fn"
 *     title="...">` — the footnote body text lives entirely in the `title` attribute; the node
 *     has no editable child content (`atom: true`), matching the legacy editor's click-to-edit
 *     footnote UX.
 *
 * Protocol: `PARA` (U+2029, the Unicode "paragraph separator") is a private-use join marker
 * later markdown modules splice into a footnote's `text` attr when the footnote body spans
 * multiple source paragraphs on one logical markdown line — it must never appear in ordinary
 * document text, since nothing in this schema parses or renders it specially. Keep this schema
 * in lockstep with the legacy `editor/app.js` schema until that file is removed; any divergence
 * breaks round-tripping against already-authored CLQ issue Markdown.
 */
import { Schema } from "prosemirror-model";
import { schema as basic } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

/**
 * Private-use paragraph-separator character (U+2029) used as an inert join marker between
 * paragraphs of a single footnote's text when serialised onto one Markdown source line. See the
 * file header for the full invariant.
 */
export const PARA = " ";

const marks = basic.spec.marks.addToEnd("smallcaps", {
  // Recognise either the canonical `<span class="clq-sc">` markup this schema itself emits, or
  // an inline `font-variant: small-caps` style (e.g. pasted rich text) as the same mark.
  parseDOM: [
    { tag: "span.clq-sc" },
    { style: "font-variant", getAttrs: (v: string) => /small-caps/.test(v) && null },
  ],
  toDOM() {
    return ["span", { class: "clq-sc" }, 0];
  },
});

const nodes = addListNodes(basic.spec.nodes, "paragraph block*", "block").addToEnd("footnote", {
  // Inline, atomic (no editable children — the body text is the `text` attr, edited out-of-line
  // by the editor UI), and explicitly selectable/non-draggable to match the legacy click-to-edit
  // footnote behaviour.
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { text: { default: "" } },
  toDOM(node) {
    return ["sup", { class: "clq-fn", title: node.attrs.text }, "fn"];
  },
  parseDOM: [
    {
      tag: "sup.clq-fn",
      getAttrs: (d: HTMLElement) => ({ text: d.getAttribute("title") || "" }),
    },
  ],
});

/** The CLQ Proofing Editor's ProseMirror schema — see the file header for its composition. */
export const clqSchema: Schema = new Schema({ nodes, marks });
