/**
 * app/page.tsx
 *
 * Usage scope: root route ("/") of the CLQ Proofing Editor Next.js app.
 *
 * Purpose: placeholder landing page for the app-shell scaffolding task. Renders a heading only
 * so the app shell can be verified end-to-end (build/dev/deploy) before the real editor is
 * ported. The actual ProseMirror-based proofing editor (round-tripping Markdown against
 * `openlaw-au/cla-clq` via the GitHub contents API) is implemented as a `'use client'`
 * component in a later task and rendered from this page.
 *
 * Protocol: this file stays a server component until the editor component is wired in; the
 * editor component itself must be `'use client'` since it touches ProseMirror's DOM-based
 * EditorView, browser storage, and network calls.
 */
export default function Home() {
  return (
    <main>
      <h1>CLQ Proofing Editor</h1>
    </main>
  );
}
