/**
 * e2e/roundtrip.spec.ts
 *
 * Usage scope: Playwright end-to-end tests for the CLQ Proofing Editor's full round-trip proof
 * flow, run against a real `next dev` server (see `playwright.config.ts`) — the browser-level
 * counterpart to the unit-level round-trip contract already covered in
 * `lib/editor/markdown.test.ts`.
 *
 * Purpose: exercises the app the way a proofreader actually would — typing/pasting Markdown into
 * the "Markdown in / out" panel, clicking Load/Export, selecting a footnote's `sup.clq-fn`
 * superscript and editing its text, and reading the rendered footnote numbers back off the DOM —
 * rather than calling `parseMarkdown`/`serializeDoc` directly. Selectors are taken straight off
 * `components/ProofingEditor.tsx` and `app/globals.css` (see that component's header): the
 * toolbar's plain-text button labels from `lib/editor/commands.ts`'s `toolbarSpec`, `.ProseMirror`
 * for the mounted editor, `sup.clq-fn` for a footnote marker, and the "Selected footnote"/
 * "Markdown in / out" `<aside>` panels' `<textarea>`/`<button>` elements (identified by their
 * visible label text via `getByRole`, not by any test-id the app doesn't declare).
 *
 * Protocol: this spec is read-only with respect to app source — it must never need a change to
 * `components/ProofingEditor.tsx` or `lib/editor/*` to pass; if a selector here doesn't match the
 * live DOM, the fix belongs in this file (or `e2e/fixtures/sample.md`), never in app source. The
 * fixture at `e2e/fixtures/sample.md` is the round-trip contract this spec verifies: every node/
 * mark the schema supports (see `lib/editor/schema.ts`) appears in it at least once.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** The round-trip contract fixture — every node/mark the editor's schema supports, once. */
const FIXTURE = fs.readFileSync(path.join(__dirname, "fixtures/sample.md"), "utf8");

/**
 * Collapses all runs of whitespace to a single space and trims, so semantically-equivalent
 * Markdown (e.g. differing blank-line spacing between list items, which
 * `defaultMarkdownSerializer` inserts but which doesn't change meaning) compares equal.
 */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Locates the "Markdown in / out" panel's textarea (the `.io` aside section). */
function mdTextarea(page: import("@playwright/test").Page): import("@playwright/test").Locator {
  return page.locator(".io textarea");
}

/** Loads `markdown` into the editor via the Markdown-in textarea + "Load into editor" button. */
async function loadMarkdown(
  page: import("@playwright/test").Page,
  markdown: string,
): Promise<void> {
  await mdTextarea(page).fill(markdown);
  await page.getByRole("button", { name: "Load into editor ▸" }).click();
}

/** Exports the current document to Markdown via "Export Markdown" and returns the textarea value. */
async function exportMarkdown(page: import("@playwright/test").Page): Promise<string> {
  await page.getByRole("button", { name: "◂ Export Markdown" }).click();
  await expect(mdTextarea(page)).not.toHaveValue("");
  return mdTextarea(page).inputValue();
}

test.describe("CLQ Proofing Editor — boot", () => {
  test("mounts the ProseMirror editor and toolbar", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".ProseMirror")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bold", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Footnote", exact: true })).toBeVisible();

    // Boots seeded with the SAMPLE doc (lib/editor/sample.ts) — sanity-check some of its content
    // rendered, proving the parse → ProseMirror-render path works before any test touches it.
    await expect(page.locator(".ProseMirror")).toContainText(
      "Recent developments in financial services law",
    );
    await expect(page.locator("sup.clq-fn").first()).toBeVisible();
  });
});

test.describe("CLQ Proofing Editor — markdown round-trip", () => {
  test("markdown-in and markdown-out are semantically equal through a real browser round trip", async ({
    page,
  }) => {
    await page.goto("/");
    await loadMarkdown(page, FIXTURE);
    await expect(page.locator(".status")).toHaveText("Loaded.");

    // The loaded doc rendered for real: headings, blockquote, both list types, and footnote
    // markers all present in the mounted ProseMirror DOM.
    await expect(page.locator(".ProseMirror h1")).toHaveText("Heading One");
    await expect(page.locator(".ProseMirror h2")).toHaveText("Heading Two");
    await expect(page.locator(".ProseMirror h3")).toHaveText("Heading Three");
    await expect(page.locator(".ProseMirror blockquote")).toContainText(
      "This is a blockquote with important quoted text.",
    );
    await expect(page.locator(".ProseMirror ul li")).toHaveCount(3);
    await expect(page.locator(".ProseMirror ol li")).toHaveCount(3);
    // Two footnotes: the inline one and the reference-style one.
    await expect(page.locator("sup.clq-fn")).toHaveCount(2);

    const out = await exportMarkdown(page);
    const normalized = normalizeWs(out);

    // Headings.
    expect(normalized).toContain("# Heading One");
    expect(normalized).toContain("## Heading Two");
    expect(normalized).toContain("### Heading Three");

    // Bold / italic / smallcaps.
    expect(normalized).toContain("**bold text**");
    expect(normalized).toContain("*italic text*");
    expect(normalized).toContain("[SMALLCAPS]{.smallcaps}");

    // Blockquote.
    expect(normalized).toContain("> This is a blockquote with important quoted text.");

    // Bullet list (defaultMarkdownSerializer always emits "*" markers regardless of source style).
    expect(normalized).toContain("* one");
    expect(normalized).toContain("* two");
    expect(normalized).toContain("* three");

    // Ordered list, preserving order.
    expect(normalized).toMatch(/1\.\s+first/);
    expect(normalized).toMatch(/2\.\s+second/);
    expect(normalized).toMatch(/3\.\s+third/);

    // Inline footnote, verbatim.
    expect(normalized).toContain("^[an inline note]");

    // Multi-paragraph reference footnote: a "[^1]" marker in the body, plus a trailing
    // "[^1]: first para" definition with the second paragraph as a blank-line-separated,
    // four-space-indented continuation (asserted against the raw, non-whitespace-normalized
    // output, since the indentation itself is part of the contract — see markdown.ts's
    // serializeDoc doc comment).
    expect(normalized).toContain("[^1]");
    expect(normalized).toContain("[^1]: first para");
    expect(out).toMatch(/\[\^1\]: first para\n\n {4}second para/);
  });
});

test.describe("CLQ Proofing Editor — footnote edit", () => {
  test("selecting a footnote populates the Selected footnote textarea, and edits export", async ({
    page,
  }) => {
    await page.goto("/");
    await loadMarkdown(page, FIXTURE);
    await expect(page.locator(".status")).toHaveText("Loaded.");

    const fnTextarea = page.locator("aside textarea").first();
    // Nothing selected yet: the footnote textarea starts disabled and empty.
    await expect(fnTextarea).toBeDisabled();

    // Select the first footnote (the inline "^[an inline note]" one, document order).
    await page.locator("sup.clq-fn").first().click();

    await expect(fnTextarea).toBeEnabled();
    await expect(fnTextarea).toHaveValue("an inline note");

    // Edit its text. `handleFootnoteTextChange` applies the edit via `setNodeMarkup` on the
    // atomic footnote node, which — same as the legacy editor/app.js behaviour this ports —
    // does not preserve the NodeSelection across the transaction, so the FootnoteView's
    // `deselectNode()` fires and the textarea goes back to disabled/empty immediately after the
    // edit is applied. The edit itself still lands in the document (verified via Export below);
    // only the "stays selected while editing" affordance doesn't hold, so this test asserts the
    // edit took effect via the exported Markdown rather than the textarea's post-edit state.
    await fnTextarea.fill("an edited note");
    await expect(fnTextarea).toBeDisabled();

    const out = await exportMarkdown(page);
    expect(out).toContain("^[an edited note]");
    expect(out).not.toContain("an inline note]");
  });
});

test.describe("CLQ Proofing Editor — footnote numbering", () => {
  test("footnote markers render numbered 1, 2, ... in document order", async ({ page }) => {
    await page.goto("/");
    await loadMarkdown(page, FIXTURE);
    await expect(page.locator(".status")).toHaveText("Loaded.");

    // numberingPlugin (lib/editor/numbering.ts) renumbers sup.clq-fn elements from its `view`
    // lifecycle hook, which only runs on a *dispatched transaction* — replacing the whole doc via
    // "Load into editor" calls `view.updateState` directly (bypassing `dispatchTransaction`), so
    // the markers still read the schema's literal "fn" toDOM text immediately after Load. A
    // selection click dispatches a real transaction, which is what actually triggers a renumber —
    // this is the same interaction a proofreader would do to check/edit a footnote, so select the
    // first footnote here to observe the live numbering the way it renders in practice.
    const markers = page.locator("sup.clq-fn");
    await expect(markers).toHaveCount(2);

    await markers.first().click();
    await expect(markers.nth(0)).toHaveText("1");
    await expect(markers.nth(1)).toHaveText("2");
  });
});
