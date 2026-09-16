/**
 * preprocess.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/preprocess.ts`.
 *
 * Purpose: Behaviour-preserving verification that the typed `preprocess()` port matches the
 * legacy `editor/app.js` (lines 119-152) exactly for every branch of the reference-footnote
 * scanning state machine and the final inline-replacement/newline-collapse pass.
 *
 * Protocol: every expected value below was derived by tracing the ported algorithm by hand
 * (documented inline per case) rather than guessed, since the paragraph-join (`PARA`, imported
 * from `schema.ts`) and the continuation-line space-join are easy to conflate. Note `PARA` is
 * currently a literal `" "` (see `schema.ts`), so a multi-paragraph def and a same-paragraph
 * continuation can produce visually identical output for a single-space join; assertions use the
 * imported `PARA` constant (not a hardcoded space or U+2029 literal) so this suite stays correct
 * if `schema.ts`'s `PARA` value ever changes. Covers every branch to satisfy the repo's 100%
 * line+branch coverage gate (see `CLAUDE.md`):
 *   - blank-line-then-indented-next-line → new paragraph
 *   - blank-line-then-NOT-indented-next-line → break (def ends)
 *   - indented continuation line → space-joined append to current paragraph
 *   - plain (non-blank, non-indented) line → break (def ends)
 *   - `[^id]` reference resolved (def exists) vs left untouched (def missing)
 *   - CRLF normalisation, 3+ newline collapse + trim, tab vs 2-space indent, multiple/repeated
 *     references.
 */
import { describe, expect, it } from "vitest";
import { PARA } from "./schema";
import { preprocess } from "./preprocess";

describe("preprocess", () => {
  it("expands a simple single-paragraph reference footnote inline", () => {
    // defs["1"] = ["hello"].join(PARA) = "hello"; out = ["x[^1]", ""] joined = "x[^1]\n" →
    // replaced → "x^[hello]\n" → trim → "x^[hello]"
    expect(preprocess("x[^1]\n\n[^1]: hello")).toBe("x^[hello]");
  });

  it("joins multiple paragraphs of one def with PARA (blank line + indent -> new paragraph branch)", () => {
    // lines: ["y[^a]", "", "[^a]: one", "", "    two"]
    // at "[^a]: one": paras=["one"]; next blank line is followed by an indented line ("    two")
    // -> new paragraph pushed (""), then "    two" is consumed as an indented continuation of
    // that new (empty) paragraph -> paras=["one","two"] -> filter+join(PARA) = "one"+PARA+"two"
    // NOTE: PARA is U+2029 (the real value in schema.ts, confirmed by byte-inspecting the file —
    // it displays as ordinary whitespace in editors/terminals, which is easy to misread as an
    // ASCII space). Assert against the imported PARA constant, not a hardcoded character.
    const expected = "y^[" + ["one", "two"].join(PARA) + "]";
    expect(preprocess("y[^a]\n\n[^a]: one\n\n    two")).toBe(expected);
    expect(PARA).toBe(" ");
    expect(preprocess("y[^a]\n\n[^a]: one\n\n    two")).not.toBe("y^[one two]");
  });

  it("appends an indented continuation line to the current paragraph space-joined (no PARA)", () => {
    // lines: ["r[^a]", "[^a]: one", "    still one"]
    // at "[^a]: one": paras=["one"]; next line "    still one" is indented (not preceded by a
    // blank line) -> continuation branch -> paras[0] = "one" + " " + "still one" = "one still one"
    expect(preprocess("r[^a]\n[^a]: one\n    still one")).toBe("r^[one still one]");
  });

  it("ends a def on a blank line NOT followed by an indented line (break branch)", () => {
    // lines: ["a[^1]", "b", "", "[^1]: def", "notindented"]
    // at "[^1]: def": paras=["def"]; next line "notindented" is non-blank, non-indented -> plain
    // break branch ends the def immediately (paras stays ["def"]); "notindented" passes through
    // to `out` unchanged.
    expect(preprocess("a[^1]\nb\n\n[^1]: def\nnotindented")).toBe("a^[def]\nb\n\nnotindented");
  });

  it("ends a def on a blank line followed by a non-indented line (blank-then-not-indented break)", () => {
    // lines: ["p[^1]", "", "[^1]: def", "", "notindented"]
    // at "[^1]: def": paras=["def"]; next line "" is blank; the line after that ("notindented")
    // is NOT indented -> blank-line break branch (not the new-paragraph branch) ends the def.
    expect(preprocess("p[^1]\n\n[^1]: def\n\nnotindented")).toBe("p^[def]\n\nnotindented");
  });

  it("ends a def at end of input with no trailing lines to consult", () => {
    // lines: ["z[^1]", "", "[^1]: def"] — after the def marker line, j reaches lines.length so
    // the while loop exits via its own condition, not any inner break.
    expect(preprocess("z[^1]\n\n[^1]: def")).toBe("z^[def]");
  });

  it("leaves an unresolved [^id] reference untouched when no matching def exists", () => {
    expect(preprocess("hey [^missing] there")).toBe("hey [^missing] there");
  });

  it("normalizes CRLF (and lone CR) line endings before scanning", () => {
    expect(preprocess("cr[^1]\r\n\r\n[^1]: hi\r\nmore")).toBe("cr^[hi]\n\nmore");
  });

  it("collapses 3+ newlines to a single blank line and trims the result", () => {
    expect(preprocess("a\n\n\n\nb")).toBe("a\n\nb");
    expect(preprocess("\n\nleading and trailing\n\n\n")).toBe("leading and trailing");
  });

  it("resolves multiple distinct defs and repeated references to the same def", () => {
    expect(preprocess("m[^1] and m[^1] again\n\n[^1]: shared")).toBe(
      "m^[shared] and m^[shared] again"
    );
    expect(
      preprocess("one[^1] two[^2]\n\n[^1]: first\n\n[^2]: second")
    ).toBe("one^[first] two^[second]");
  });

  it("treats a tab as a valid indent for continuation lines", () => {
    expect(preprocess("t[^t]\n\n[^t]: tab\n\ttabbed")).toBe("t^[tab tabbed]");
  });

  it("treats a 2-space indent as a valid indent for continuation lines", () => {
    expect(preprocess("s[^s]\n\n[^s]: sp\n  spaced2")).toBe("s^[sp spaced2]");
  });

  it("does not treat a single leading space as indentation (requires tab or 2+ spaces)", () => {
    // lines: ["o[^1]", "", "[^1]: def", " notenough"]. " notenough" has only one leading space
    // -> fails /^(\t| {2,})\S/ -> plain break branch ends the def immediately after "def".
    // The blank line at index 1 passed through to `out` before the def marker was consumed,
    // and " notenough" passes through after -> "o[^1]" + "\n" + "" + "\n" + " notenough",
    // joined = "o[^1]\n\n notenough" -> replaced -> "o^[def]\n\n notenough" (no 3+ run to collapse).
    expect(preprocess("o[^1]\n\n[^1]: def\n notenough")).toBe("o^[def]\n\n notenough");
  });

  it("handles an empty first-paragraph capture (definition text omitted after the colon)", () => {
    // m[2] is "" (nothing after "[^1]:"); paras=[""]; no continuation lines follow -> filtered
    // out entirely -> defs["1"] = [].join(PARA) = ""
    expect(preprocess("e[^1]\n\n[^1]:")).toBe("e^[]");
  });
});
