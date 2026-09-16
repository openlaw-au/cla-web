/**
 * app/layout.tsx
 *
 * Usage scope: root layout for the CLQ Proofing Editor (Next.js App Router). Wraps every
 * route in this app; renders the `<html>`/`<body>` shell.
 *
 * Purpose: server component (no 'use client') that sets document-level metadata (title) and
 * loads the global stylesheet. This is the App Router replacement for the static
 * `editor/index.html` shell used by the now-removed legacy ProseMirror ES-module build
 * (`app.js`/`bundle.js`/`index.html`/`index_local.html`, deleted once the editor UI was
 * fully ported into this app — see `editor/README.md`).
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
