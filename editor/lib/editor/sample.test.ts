/**
 * sample.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/sample.ts`.
 *
 * Purpose: Verifies `SAMPLE` is present and exercises both CLQ-specific markdown extensions —
 * an inline `^[...]` footnote and a `[...]{.smallcaps}` span — proving it's a meaningful smoke
 * test of the parse → render round trip when used to seed the editor.
 *
 * Protocol: covers the sole export of sample.ts to satisfy the repo's 100% coverage gate (see
 * `CLAUDE.md`).
 */
import { describe, expect, it } from "vitest";
import { SAMPLE } from "./sample";

describe("SAMPLE", () => {
  it("is a non-empty string", () => {
    expect(typeof SAMPLE).toBe("string");
    expect(SAMPLE.length).toBeGreaterThan(0);
  });

  it("contains an inline ^[ footnote", () => {
    expect(SAMPLE).toContain("^[");
  });

  it("contains a {.smallcaps} span", () => {
    expect(SAMPLE).toContain("{.smallcaps}");
  });
});
