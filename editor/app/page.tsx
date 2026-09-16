/**
 * app/page.tsx
 *
 * Usage scope: root route ("/") of the CLQ Proofing Editor Next.js app.
 *
 * Purpose: renders the `ProofingEditor` client component — the ProseMirror-based proofing editor
 * that round-trips Markdown against `openlaw-au/cla-clq` via the GitHub contents API. This page
 * itself stays a server component; all interactivity lives in `ProofingEditor`.
 *
 * Protocol: this file stays a server component. Any interactive/stateful behaviour (the
 * ProseMirror editor itself, GitHub panel, localStorage) belongs in `ProofingEditor`
 * (`'use client'`), never hoisted here.
 */
import ProofingEditor from "../components/ProofingEditor";

export default function Home(): React.JSX.Element {
  return <ProofingEditor />;
}
