/**
 * preprocess.ts
 *
 * Usage scope: Runs on raw Markdown source text BEFORE it reaches the markdown parser, in the
 * (forthcoming) CLQ Proofing Editor markdown-parsing pipeline. Imported wherever a `.md` issue
 * file's text is loaded for editing.
 *
 * Purpose: Typed, behaviour-preserving port of `preprocess()` previously inlined in the legacy
 * `editor/app.js` (lines 119-152). Markdown reference-style footnotes — a body-text marker
 * `[^id]` paired with a separate reference definition line `[^id]: definition text` (which may
 * itself span multiple paragraphs via blank-line + indent continuation, à la CommonMark/Pandoc
 * footnote syntax) — are expanded into the editor's native *inline* footnote syntax `^[definition
 * text]` before markdown parsing, so the parser/schema (see `schema.ts`) never needs to know
 * reference-style footnotes exist. A reference definition whose body spans multiple source
 * paragraphs has those paragraphs joined with `PARA` (see `schema.ts`) so the resulting inline
 * footnote stays on one logical markdown line while still recording the paragraph break.
 *
 * Protocol: keep every regex and branch here in lockstep, byte-for-byte, with the legacy
 * `editor/app.js` `preprocess()` until that file is removed; any divergence breaks round-tripping
 * against already-authored CLQ issue Markdown. Do not modify `editor/app.js` or `schema.ts`.
 */
import { PARA } from "./schema";

/**
 * Expand reference-style footnote definitions (`[^id]: text`, optionally spanning multiple
 * indented paragraphs) into inline footnotes (`^[text]`) at every `[^id]` reference site in the
 * body text, ahead of markdown parsing.
 *
 * Algorithm (ported verbatim from `editor/app.js` lines 120-152):
 * 1. Normalise CRLF/CR line endings to LF and split into lines.
 * 2. Scan lines for a reference-definition line `^[^id]:[ \t]*(.*)$`. When found, collect its
 *    (possibly multi-paragraph) body:
 *    - The first paragraph is capture group 2, trimmed.
 *    - A blank line followed by an indented (`\t` or 2+ spaces) non-blank line starts a new,
 *      initially-empty paragraph and continues scanning.
 *    - A blank line NOT followed by an indented line ends the definition.
 *    - An indented non-blank line is a continuation of the current paragraph: its leading
 *      indent is stripped, it is trimmed, and it is appended to the current paragraph
 *      space-joined.
 *    - Any other line ends the definition.
 *    Paragraphs are then filtered to drop empty entries and joined with `PARA`, and stored under
 *    the trimmed id. The definition's lines (including the marker line) are consumed from the
 *    output; all other lines pass through unchanged.
 * 3. Every `[^id]` occurrence in the remaining body is replaced with `^[<definition>]` when a
 *    definition for that id was collected; unresolved ids are left untouched.
 * 4. Runs of 3+ newlines collapse to a single blank line, and the result is trimmed.
 *
 * @param text Raw Markdown source, possibly containing reference-style footnotes.
 * @returns Markdown source with all resolvable reference footnotes expanded inline.
 */
export function preprocess(text: string): string {
  const defs: Record<string, string> = {};
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\[\^([^\]]+)\]:[ \t]*(.*)$/);
    if (m) {
      const paras = [m[2].trim()];
      let j = i + 1;
      while (j < lines.length) {
        if (/^\s*$/.test(lines[j])) {
          // blank line…
          if (j + 1 < lines.length && /^(\t| {2,})\S/.test(lines[j + 1])) {
            // …followed by indent → new paragraph
            paras.push("");
            j++;
            continue;
          }
          break;
        }
        if (/^(\t| {2,})\S/.test(lines[j])) {
          // indented continuation
          const t = lines[j].replace(/^(\t| {2,})/, "").trim();
          paras[paras.length - 1] = paras[paras.length - 1] ? paras[paras.length - 1] + " " + t : t;
          j++;
          continue;
        }
        break;
      }
      defs[m[1].trim()] = paras.filter((p) => p !== "").join(PARA);
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  let body = out
    .join("\n")
    .replace(/\[\^([^\]]+)\]/g, (mm, id) =>
      defs[id.trim()] != null ? "^[" + defs[id.trim()] + "]" : mm,
    );
  return body.replace(/\n{3,}/g, "\n\n").trim();
}
