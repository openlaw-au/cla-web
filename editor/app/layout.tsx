/**
 * app/layout.tsx
 *
 * Usage scope: root layout for the CLQ Proofing Editor (Next.js App Router). Wraps every
 * route in this app; renders the `<html>`/`<body>` shell.
 *
 * Purpose: server component (no 'use client') that sets document-level metadata (title) and
 * loads the global stylesheet. This is the App Router replacement for the static
 * `editor/index.html` shell used by the legacy ProseMirror ES-module build — see
 * `editor/BUILD.md`. The legacy `app.js`/`bundle.js`/`index.html`/`index_local.html` files
 * remain untouched during this scaffolding task and are removed in a later task once the
 * editor UI is ported into this app.
 *
 * Protocol: keep this file a server component. Any interactive/stateful behaviour (the
 * ProseMirror editor itself, auth, etc.) belongs in a `'use client'` child component rendered
 * from a page, never hoisted into this layout.
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CLQ Proofing Editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
