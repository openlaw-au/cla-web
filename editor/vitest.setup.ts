/**
 * vitest.setup.ts
 *
 * Usage scope: Vitest global setup file, loaded once per test file via
 * `vitest.config.ts`'s `test.setupFiles`.
 *
 * Purpose: registers `@testing-library/jest-dom`'s custom matchers (e.g. `toBeInTheDocument`)
 * on Vitest's `expect`, so component tests written against Testing Library read naturally; and
 * shims the layout-measurement DOM APIs jsdom does not implement on `Range` (`getClientRects`,
 * `getBoundingClientRect`) or `Document` (`elementFromPoint`) but `prosemirror-view` calls
 * unconditionally on mouse events and `scrollIntoView()` (e.g. `EditorView.posAtCoords`/
 * `coordsAtPos`, used by click-to-select and `insertFootnote`'s `.scrollIntoView()`). jsdom
 * implements both methods on `Element` (returning empty/zero-size, since it has no layout
 * engine) but not on `Range` at all, and `coordsAtPos` measures a `Range` spanning a text
 * position, not an `Element`. Returning empty/zero-size results instead of throwing lets
 * ProseMirror's own "nothing found at these coordinates" fallback paths run, matching how these
 * editors already behave in headless/CI browsers with no real layout.
 *
 * Protocol: keep this file limited to global test-environment setup (matcher registration,
 * global mocks) — test-specific setup belongs in the individual test file, not here.
 */
import "@testing-library/jest-dom";

const emptyClientRects = (): DOMRectList =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;

const zeroBoundingClientRect = (): DOMRect =>
  ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {},
  }) as DOMRect;

if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = emptyClientRects;
}

if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = zeroBoundingClientRect;
  }
}

if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}
