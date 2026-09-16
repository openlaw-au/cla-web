# cla-web

> Websites for the **Commercial Law Association of Australia** — hosting the Commercial Law
> Quarterly and providing a browser-based surface for final proof editing.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript)](https://www.typescriptlang.org/)
[![ProseMirror](https://img.shields.io/badge/ProseMirror-Editor-8A2BE2)](https://prosemirror.net/)
[![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright)](https://playwright.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Status](#status)
- [License](#license)

---

## Overview

`cla-web` does two jobs:

1. **Publish CLQ** — present built issues from `openlaw-au/cla-clq` as a public site: a landing
   page listing published issues (PDF as the canonical download) and a web reading view,
   generated from `site/issues.json` by `site/build-site.py`.
2. **Proof editing** — give editors a rich-text surface to correct copy without touching LaTeX.
   The **CLQ Proofing Editor** (`editor/`) is a **Next.js 16 + React 19 +
   TypeScript** app that round-trips Markdown (the format the production pipeline consumes)
   against `openlaw-au/cla-clq` via the GitHub contents API. The press build always happens in
   `cla-tamara-print`'s CI — this repo is never the source of truth for the final PDF.

`docs/overleaf.md` documents the **interim proofing surface** — Overleaf's Visual Editor synced
to `cla-clq` — which works today with zero build and cannot drift from the LaTeX. It remains a
fine option wherever a zero-build surface is wanted.

---

## Architecture

```
                     ┌───────────────────────────────┐
                     │     Next.js 16 editor app     │
                     │   components/ProofingEditor   │
                     │  (ProseMirror, 'use client')  │
                     └───────────────────────────────┘
                                     │ GitHub contents API
                                     │ (load / save, token in memory only)
                                     ▼
                     ┌────────────────────────────┐
                     │     openlaw-au/cla-clq     │
                     │  (Markdown source + PDFs)  │
                     └────────────────────────────┘
                                    │
                     cla-tamara-print pipeline (CI)
                                    │
                                    ▼
                               press PDF
                                    │
                     ┌──────────────────────┐
                     │   site/issues.json   │
                     │  site/build-site.py  │
                     │  → dist/index.html   │
                     └──────────────────────┘
                                 │
                     GitHub Pages (public site)

   editor deploy:  OpenNext → Cloudflare Workers
```

- **Editor is the proofing surface, never the source of truth.** The final PDF always comes
  from the LaTeX build in `cla-tamara-print`.
- **Canonical source while proofing** is the Markdown, not the `.tex`; the LaTeX is a render
  target.
- **Fidelity checklist**: footnotes (inline and multi-paragraph reference notes), italic case
  names, small caps, defined terms, block quotes, and run-in headings must survive editing and
  round-trip cleanly.
- **Versioning**: each save is a commit in `cla-clq`, so proof history is tracked.
- **Public site build stays Python** — `site/build-site.py` only presents content pulled from
  `cla-clq`; it never invents any.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Editor framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | [React 19](https://react.dev/) |
| Language | [TypeScript](https://www.typescriptlang.org/) |
| Rich-text engine | [ProseMirror](https://prosemirror.net/) + [markdown-it](https://github.com/markdown-it/markdown-it) |
| Unit Testing | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |
| E2E Testing | [Playwright](https://playwright.dev/) |
| Editor hosting | [Cloudflare Workers](https://workers.cloudflare.com/) via [OpenNext](https://opennext.js.org/) / [Wrangler](https://developers.cloudflare.com/workers/wrangler/) |
| Public site | [Python](https://www.python.org/) (`site/build-site.py`), tested with [pytest](https://docs.pytest.org/) |
| Public site hosting | [GitHub Pages](https://pages.github.com/) |

---

## Getting Started

### Prerequisites

- **Node.js** 22.x
- **Python** 3.x (for `site/`)
- A GitHub token with repo scope for `cla-clq` (fine-grained PAT scoped to `cla-clq`, or a
  classic `repo` token) — needed to load/save articles from the editor

### Installation

```bash
git clone git@github.com:openlaw-au/cla-web.git
cd cla-web/editor
npm ci
```

### Running Locally

```bash
cd editor
npm run dev
```

For deployment, the editor needs Cloudflare account credentials (`CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`) configured for Wrangler/OpenNext; the GitHub token used for load/save
is entered in the editor UI and kept in memory only — never written to disk or committed.

To build and preview the public site locally:

```bash
mkdir -p site/data && cp ../cla-clq/index/all_index.json site/data/all_index.json
python3 site/build-site.py --out dist
python3 -m http.server -d dist 8080     # open http://localhost:8080/
```

---

## Project Structure

```
cla-web/
├── editor/                    # CLQ Proofing Editor (Next.js 16 + React 19 + TypeScript)
│   ├── app/                   # App Router — pages & routes
│   ├── components/
│   │   └── ProofingEditor.tsx # 'use client' ProseMirror editor component
│   ├── lib/
│   │   └── editor/            # typed Markdown <-> ProseMirror conversion modules
│   └── e2e/                   # Playwright round-trip tests
├── site/                      # Public CLQ landing page (Python)
│   ├── build-site.py          # generates dist/index.html from issues.json
│   └── issues.json            # published-issue manifest
├── docs/
│   ├── architecture.md        # overall design (CLQ hosting + proofing round-trip)
│   └── overleaf.md            # interim proofing surface (Overleaf Visual Editor)
├── .github/workflows/
│   └── pages.yml              # build + deploy the public site to GitHub Pages
├── CLAUDE.md
└── README.md
```

---

## Key Features

- **Round-trip Markdown proofing** — headings (H1–H3), bold, italic (case names), block
  quotes, bullet and numbered lists.
- **Small caps** — `[text]{.smallcaps}` pandoc syntax, editable via toolbar/shortcut, for
  defined terms and acronyms; the `cla-tamara-print` pipeline turns these into `\textsc{…}`.
- **Footnotes** — both pandoc inline footnotes (`^[text]`) and reference footnotes (`[^n]` …
  `[^n]: text`), including **multi-paragraph** notes with indented continuation paragraphs;
  footnotes render as superscripts, distinguishing single- and multi-paragraph notes.
- **Footnote numbering** — kept consistent across edits and on export.
- **GitHub load/save** — load an article's Markdown from `cla-clq` by repository, file path,
  and branch, and save proofed changes back as a commit; the blob SHA is tracked so saves apply
  cleanly.

---

## Testing

```bash
# Editor unit tests (Vitest) — 100% coverage required
cd editor
npm test

# Editor end-to-end round-trip tests (Playwright)
npm run test:e2e

# Public site (Python) — 100% coverage required
cd site
pytest --cov --cov-branch --cov-fail-under=100
```

---

## Deployment

| Component | Target | Trigger |
|---|---|---|
| Editor (`editor/`) | Cloudflare Workers, via OpenNext | CI on push to `dev`/`prod` (per workflow config) |
| Public site (`site/`) | GitHub Pages | Push to `site/**` (`.github/workflows/pages.yml`), or manual dispatch |

The public-site workflow pulls the built issue PDFs and cumulative index from
`openlaw-au/cla-clq` (via a `CLQ_REPO_TOKEN` secret), generates the landing page from
`site/issues.json`, and publishes `dist/` to Pages.

---

## Contributing

Work happens on `dev`. `prod` is the default branch and is protected — changes land via pull
request, never a direct push.

1. Branch from `dev`.
2. Make changes; keep the editor's unit-test coverage at 100% and add Playwright coverage for
   any round-trip behaviour change.
3. Run `npm test`, `npm run test:e2e`, `npm run lint`, and `npm run typecheck` in `editor/`
   (and `pytest --cov --cov-branch --cov-fail-under=100` in `site/` for site changes).
4. Open a pull request into `prod`.

---

## Status

The editor has been rewritten from a static ProseMirror module into the Next.js/React/TypeScript
app described above, with 100% unit-test coverage and Playwright end-to-end tests. The public
CLQ site (`site/`) is built and deploys via GitHub Pages. The
repository is private until the site is ready, then made public
(`gh repo edit openlaw-au/cla-web --visibility public`).

---

## License

This project is maintained by the Commercial Law Association of Australia. All rights reserved.
