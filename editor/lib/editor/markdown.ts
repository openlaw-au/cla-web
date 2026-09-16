/**
 * markdown.ts
 *
 * Usage scope: The CLQ Proofing Editor's Markdown ⇄ ProseMirror round-trip contract — imported
 * wherever a `.md` issue file's text is loaded into the editor (`parseMarkdown`) or a ProseMirror
 * document is turned back into Markdown to save/commit (`serializeDoc`). This is the single most
 * load-bearing module in the rewrite: every edit a proofreader makes must survive a parse →
 * serialize round trip byte-for-byte on the parts they didn't touch, or the diff sent back to
 * `openlaw-au/cla-clq` will corrupt copy the editor never showed as changed.
 *
 * Purpose: Typed, behaviour-preserving port of the markdown-it configuration + `MarkdownParser` +
 * `MarkdownSerializer` setup previously inlined in the legacy `editor/app.js` (lines 30-117). It
 * layers three CLQ-specific extensions onto CommonMark (via `markdown-it`'s `"commonmark"`
 * preset, `html: false`):
 *
 *   - **Inline footnotes** `^[...]` — a custom markdown-it inline rule (`clq_footnote`,
 *     registered before `emphasis` so `^` doesn't get mistaken for anything else) that matches a
 *     caret immediately followed by a bracketed span, tracking bracket nesting depth so a
 *     footnote body may itself contain `[...]` (e.g. a law report citation like `[2024] FCA
 *     784`). Parses to the schema's atomic `footnote` node (see `schema.ts`), whose `text` attr
 *     is the raw body with the private `PARA` (U+2029) separator swapped back to real blank-line
 *     paragraph breaks.
 *   - **Reference-style footnotes** `[^id]` / `[^id]: definition` — never seen by markdown-it or
 *     this parser directly; `preprocess()` (see `preprocess.ts`) expands them into the inline
 *     `^[...]` form (joining multi-paragraph definitions with `PARA`) before the text reaches
 *     `md.parse`. `parseMarkdown()` always runs `preprocess()` first so callers never need to
 *     think about which footnote style the source file used.
 *   - **Small caps** `[text]{.smallcaps}` — pandoc's native small-caps bracketed-span syntax, via
 *     a second custom inline rule (`clq_smallcaps`, registered before `link` so a smallcaps span
 *     is never mistaken for a link whose "title" is `{.smallcaps}`), tracking bracket depth the
 *     same way, but only firing when the bracketed span is immediately followed by the literal
 *     `]{.smallcaps}` tail. Parses to the schema's `smallcaps` mark.
 *
 * On the way back out, `serializeDoc()` mirrors the split between the two footnote styles: a
 * single-paragraph footnote serializes inline as `^[...]` (collapsing any internal
 * paragraph/whitespace runs to single spaces, since inline footnotes live on one source line);
 * a multi-paragraph footnote (its trimmed text attr contains a blank-line-separated paragraph
 * break) instead serializes as a numbered reference marker `[^n]`, with the full definition
 * (including indented continuation paragraphs) appended after the document body — matching
 * standard Markdown reference-footnote-definition syntax so downstream tools (and a future
 * re-parse via `preprocess()`) round-trip it correctly.
 *
 * Protocol: keep every regex, rule, and branch here in lockstep, byte-for-byte, with the legacy
 * `editor/app.js` (lines 30-117) until that file is removed; any divergence breaks round-tripping
 * against already-authored CLQ issue Markdown. The `_fnDefs` array that app.js holds as bare
 * module-level state is instead closed over privately in this module and reset at the start of
 * every `serializeDoc()` call, making `serializeDoc` re-entrant-safe across repeated/concurrent
 * calls (no doc's footnote numbering can leak into another doc's serialization) while preserving
 * the exact numbering (1-based, in document order) and definition-block formatting (each
 * continuation paragraph indented by four spaces, definitions blank-line-joined and appended
 * after a blank line). Do not modify `editor/app.js`, `schema.ts`, or `preprocess.ts`.
 */
import type Token from "markdown-it/lib/token.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type { Node } from "prosemirror-model";
import MarkdownIt from "markdown-it";
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import { clqSchema, PARA } from "./schema";
import { preprocess } from "./preprocess";

/**
 * The markdown-it tokenizer instance backing {@link parser}: CommonMark, no raw HTML, plus the
 * two CLQ-specific inline rules below.
 */
const md = MarkdownIt("commonmark", { html: false });

/**
 * Inline rule for `^[...]` footnotes (registered before `emphasis`, so a leading `^` is claimed
 * by this rule before emphasis scanning ever considers the characters around it).
 *
 * Matches a literal `^` (0x5E) immediately followed by `[` (0x5B) at the current position, then
 * scans forward tracking bracket nesting depth (`[` → +1 level, `]` → -1 level) so the footnote
 * body may itself contain balanced `[...]` spans (e.g. `^[see [2024] FCA 784]`). The rule fails
 * (returns `false`, leaving `state.pos` untouched so other rules — or plain text — get a chance
 * at the same input) in two cases: the position isn't `^[` at all, or the brackets never balance
 * before the end of the inline content (`level !== 0` when the scan runs out of room).
 *
 * On a real (non-silent) match, pushes a `"footnote"` token whose `.content` is the raw slice
 * between the brackets (not yet split on `PARA` — that happens in the parser's `getAttrs`, see
 * {@link parser}), and advances `state.pos` past the closing `]`.
 *
 * `silent` mode is markdown-it's validation-only pass (used by things like link-label lookahead)
 * where a rule must report whether it *would* match without mutating token output; this rule's
 * match/no-match logic is identical either way, only the token-push is skipped.
 */
function clqFootnoteRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5e /* ^ */ || src.charCodeAt(start + 1) !== 0x5b /* [ */) {
    return false;
  }
  let level = 1;
  let pos = start + 2;
  while (pos < state.posMax) {
    const c = src.charCodeAt(pos);
    if (c === 0x5b) level++;
    else if (c === 0x5d) {
      level--;
      if (level === 0) break;
    }
    pos++;
  }
  if (level !== 0) return false;
  if (!silent) {
    const t = state.push("footnote", "", 0);
    t.content = src.slice(start + 2, pos);
  }
  state.pos = pos + 1;
  return true;
}

/**
 * Inline rule for `[...]{.smallcaps}` small-caps spans (registered before `link`, so a bracketed
 * span immediately followed by the `{.smallcaps}` tail is claimed here rather than being parsed
 * as a link whose destination/title is that literal text).
 *
 * Matches a literal `[` (0x5B) at the current position, then scans forward tracking bracket
 * nesting depth the same way as {@link clqFootnoteRule}, so the span's inner text may itself
 * contain balanced brackets. The rule fails if the position isn't `[`, the brackets never
 * balance, or — critically, since plain `[...]` is otherwise a perfectly valid (if unlinked)
 * bracketed span in CommonMark — the text immediately following the closing `]` isn't exactly
 * the literal tail `]{.smallcaps}`.
 *
 * On a real match, pushes three tokens rather than one: `smallcaps_open` (nesting `1`), a `text`
 * token carrying the inner content verbatim, and `smallcaps_close` (nesting `-1`) — mirroring
 * how markdown-it represents any other mark-producing span (e.g. `em`/`strong`) as a balanced
 * open/close pair around plain content, which is what lets {@link parser}'s `smallcaps: {mark:
 * "smallcaps"}` token mapping apply the mark to the enclosed text. `state.pos` advances past the
 * entire `]{.smallcaps}` tail.
 */
function clqSmallcapsRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b /* [ */) return false;
  let depth = 1;
  let pos = start + 1;
  while (pos < state.posMax) {
    const c = src.charCodeAt(pos);
    if (c === 0x5b) depth++;
    else if (c === 0x5d) {
      depth--;
      if (depth === 0) break;
    }
    pos++;
  }
  if (depth !== 0) return false;
  const tail = "]{.smallcaps}";
  if (src.slice(pos, pos + tail.length) !== tail) return false;
  const inner = src.slice(start + 1, pos);
  if (!silent) {
    state.push("smallcaps_open", "span", 1);
    const t = state.push("text", "", 0);
    t.content = inner;
    state.push("smallcaps_close", "span", -1);
  }
  state.pos = pos + tail.length;
  return true;
}

md.inline.ruler.before("emphasis", "clq_footnote", clqFootnoteRule);
md.inline.ruler.before("link", "clq_smallcaps", clqSmallcapsRule);

/**
 * The CLQ Proofing Editor's Markdown parser: `md` tokenizes CommonMark (plus the two custom
 * inline rules above) into markdown-it tokens, and this token → ProseMirror node/mark map turns
 * that token stream into a document in {@link clqSchema}. The map is a direct, order-preserving
 * port of `editor/app.js` lines 70-86 — see that file's inline comments for provenance if this
 * ever needs re-auditing against upstream `prosemirror-markdown` changes.
 */
export const parser: MarkdownParser = new MarkdownParser(clqSchema, md, {
  blockquote: { block: "blockquote" },
  paragraph: { block: "paragraph" },
  list_item: { block: "list_item" },
  bullet_list: { block: "bullet_list" },
  ordered_list: {
    block: "ordered_list",
    getAttrs: (t: Token) => ({ order: +(t.attrGet("start") ?? "") || 1 }),
  },
  heading: { block: "heading", getAttrs: (t: Token) => ({ level: +t.tag.slice(1) }) },
  code_block: { block: "code_block", noCloseToken: true },
  fence: {
    block: "code_block",
    getAttrs: (t: Token) => ({ params: t.info || "" }),
    noCloseToken: true,
  },
  hr: { node: "horizontal_rule" },
  image: {
    node: "image",
    getAttrs: (t: Token) => ({
      src: t.attrGet("src"),
      title: t.attrGet("title") || null,
      alt: (t.children && t.children[0] && t.children[0].content) || null,
    }),
  },
  hardbreak: { node: "hard_break" },
  em: { mark: "em" },
  strong: { mark: "strong" },
  code_inline: { mark: "code", noCloseToken: true },
  smallcaps: { mark: "smallcaps" },
  link: {
    mark: "link",
    getAttrs: (t: Token) => ({ href: t.attrGet("href"), title: t.attrGet("title") || null }),
  },
  footnote: {
    node: "footnote",
    // The custom clq_footnote rule stores the raw bracketed body (possibly containing the
    // private PARA separator, injected by preprocess() for multi-paragraph reference-footnote
    // defs) directly on the token's .content — split it back into real blank-line paragraph
    // breaks for the node's `text` attr.
    getAttrs: (t: Token) => ({ text: (t.content || "").split(PARA).join("\n\n") }),
  },
});

/**
 * Per-serialize-call state for the footnote serializer below: the multi-paragraph footnote
 * bodies collected while walking a single document, in the order their reference markers
 * (`[^1]`, `[^2]`, ...) were emitted. Declared at module scope (so the `footnote` serializer
 * closure and {@link serializeDoc} can both reach it) but always reset to an empty array at the
 * start of `serializeDoc`, before that call's `serializer.serialize(doc)` runs — so no state
 * leaks between calls (see the file header's re-entrancy note). `serializeDoc` is not safe to
 * call concurrently on overlapping ticks of the event loop (no CLQ Proofing Editor workflow does
 * that: serialization is a synchronous save/commit step), only safe to call repeatedly in
 * sequence.
 */
let fnDefs: string[] = [];

/**
 * The CLQ Proofing Editor's Markdown serializer: `prosemirror-markdown`'s default node/mark
 * serializers, plus the `footnote` node serializer and `smallcaps` mark serializer below. Ported
 * from `editor/app.js` lines 90-105.
 */
export const serializer: MarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    /**
     * Serializes a `footnote` node's `text` attr back to Markdown source.
     *
     * A single-paragraph body (no blank-line paragraph break once whitespace is normalized)
     * serializes inline as `^[...]`, with any internal newline-plus-surrounding-whitespace run
     * collapsed to a single space — inline footnotes live entirely on one source line, so a
     * literal embedded newline would break re-parsing.
     *
     * A multi-paragraph body (its trimmed text matches `/\n\s*\n/`, i.e. still has a genuine
     * blank-line break after trimming) instead serializes as a numbered reference marker
     * `[^n]`, where `n` is this document's 1-based count of multi-paragraph footnotes seen so
     * far (in document order); the raw (untouched) trimmed text is pushed onto {@link fnDefs} so
     * {@link serializeDoc} can render the actual `[^n]: ...` definition block after the body.
     */
    footnote(state, node) {
      const t = (node.attrs.text || "").trim();
      if (/\n\s*\n/.test(t)) {
        fnDefs.push(t);
        state.text("[^" + fnDefs.length + "]", false);
      } else {
        state.text("^[" + t.replace(/\s*\n\s*/g, " ") + "]", false);
      }
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    // Pandoc's native small-caps bracketed-span syntax; not mixable with other marks (its
    // delimiters aren't freely reorderable the way e.g. em/strong are) and, like emphasis,
    // needs enclosing whitespace expelled outside the mark delimiters per CommonMark's span
    // rules.
    smallcaps: {
      open: "[",
      close: "]{.smallcaps}",
      mixable: false,
      expelEnclosingWhitespace: true,
    },
  },
);

/**
 * Serializes a ProseMirror document to Markdown source, resolving any multi-paragraph footnotes
 * to trailing numbered reference definitions.
 *
 * Resets the module's footnote-definition collector ({@link fnDefs}) before serializing, so each
 * call is independent of any previous call's footnotes (see {@link fnDefs}'s doc comment for the
 * re-entrancy contract this preserves from the legacy `editor/app.js`). After the main
 * `serializer.serialize(doc)` pass — during which the `footnote` node serializer above pushes
 * onto `fnDefs` for every multi-paragraph footnote it encounters — if any definitions were
 * collected, renders each as a standard Markdown reference-footnote-definition block:
 * `"[^n]: <first paragraph>"`, followed by each further paragraph on its own blank-line-separated,
 * four-space-indented continuation line (`"\n\n    <paragraph>"`), matching the indentation
 * `preprocess()` expects on re-parse. All definitions are appended after the document body,
 * separated from it (and from each other) by a blank line.
 *
 * @param doc A document in {@link clqSchema}.
 * @returns The document's Markdown source, including any trailing footnote definitions.
 */
export function serializeDoc(doc: Node): string {
  fnDefs = [];
  let out = serializer.serialize(doc);
  if (fnDefs.length) {
    const defs = fnDefs.map((t, i) => {
      const paras = t.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim());
      return (
        "[^" +
        (i + 1) +
        "]: " +
        paras[0] +
        paras
          .slice(1)
          .map((p) => "\n\n    " + p)
          .join("")
      );
    });
    out += "\n\n" + defs.join("\n\n");
  }
  return out;
}

/**
 * Parses raw Markdown source (as read from a CLQ issue file) into a ProseMirror document in
 * {@link clqSchema}.
 *
 * Always runs {@link preprocess} first, so reference-style `[^id]` / `[^id]: ...` footnotes are
 * expanded to the inline `^[...]` form the tokenizer's `clq_footnote` rule understands before
 * `parser.parse` ever sees the text — callers never need to special-case which footnote style a
 * given source file used.
 *
 * `MarkdownParser.parse`'s declared return type is non-nullable, but it is ultimately built by
 * walking a token stream and can in principle produce no content (e.g. for an empty document);
 * guard against that defensively with a clear error rather than silently handing callers
 * `null`/`undefined` typed as `Node`.
 *
 * @param text Raw Markdown source.
 * @returns The parsed document.
 * @throws If parsing produces no document (should not happen for any well-formed CLQ issue file).
 */
export function parseMarkdown(text: string): Node {
  const doc = parser.parse(preprocess(text));
  if (!doc) {
    throw new Error("parseMarkdown: markdown-it/MarkdownParser produced no document");
  }
  return doc;
}
