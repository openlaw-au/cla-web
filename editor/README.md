# CLQ Proofing Editor

A **Next.js 16 + React 19 + TypeScript** app (App Router) giving CLQ editors a browser
rich-text (ProseMirror) surface for final proof editing — so editors work in rich text,
never in LaTeX. It round-trips Markdown (the format the production pipeline consumes),
including footnotes and small caps, and can load and save an article straight to `cla-clq`
via the GitHub API.

See the repo root `CLAUDE.md` for the two-job overview, and `.claude/skills/clq-web/` for
the full behaviour contract (schema, toolbar/commands, footnote UI, GitHub persistence,
and the Markdown round-trip rules). The app itself lives in `app/page.tsx` →
`components/ProofingEditor.tsx`, with typed conversion/parsing logic in `lib/editor/*`
(schema, markdown-it rules, serializer, GitHub client).

## Run it

```bash
npm install
npm run dev          # Next.js dev server
```

## Other commands

```bash
npm test              # Vitest unit tests
npx vitest run --coverage   # coverage (100% threshold on lib/** + components/**)
npm run test:e2e       # Playwright end-to-end round-trip tests
npm run lint
npm run typecheck
npm run build          # next build
```

## Where it fits

```
author .docx ──pandoc──▶ Markdown  ──load──▶  [ this editor ]  ──save/export──▶ Markdown (cla-clq)
                                                                                     │
                                                                     cla-tamara-print pipeline (CI)
                                                                                     ▼
                                                                              press PDF
```

The editor is the **proofing surface**, never the source of truth for the final PDF — that is
always the LaTeX build in `cla-tamara-print`.

## Deploy

OpenNext → Cloudflare Workers (see `open-next.config.ts`, `wrangler.toml`).
