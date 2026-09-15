---
name: site-build
description: Use when working on the public CLQ landing page — site/build-site.py, site/issues.json, or dist/index.html generation — including adding an issue, changing the manifest shape, or touching the catalogue-only/subscriber-gated presentation.
---

# Public site build

## Overview

`site/build-site.py` is a single Python script (no framework, no templating engine
beyond f-strings) that reads a JSON manifest and writes one static file:
`dist/index.html`. It **never invents content** — every issue, title, author, and date
comes from the manifest or the optional cumulative index; if data is missing, that field
is simply omitted from the page.

## Inputs

- **`site/issues.json`** (required) — the published-issue manifest:
  ```json
  {
    "journal": "Commercial Law Quarterly",
    "association": "Commercial Law Association of Australia",
    "issues": [
      {"volume": 40, "number": 3, "year": 2026,
       "date_range": "September–November 2026",
       "cite": "(2026) 40(3) Commercial Law Quarterly",
       "clq_folder": "2026-Vol40-No3", "pdf": "issues/vol40-no3.pdf"}
    ]
  }
  ```
  `journal`/`association` default to the CLQ/CLA names if absent. Issues sort by
  `(year, volume, number)` descending (number split on `-` before int conversion, so
  `"3-special"`-style labels don't break sorting). `number_label` overrides the
  displayed number if present (falls back to `number`).

- **`site/data/all_index.json`** (optional, gitignored/generated — pulled from
  `openlaw-au/cla-clq/index/all_index.json` by the Pages workflow) — the cumulative
  article index. When present: each issue card lists its articles (filtered to
  `category in ("Article", "Case Note")` — editorial/other categories excluded), and
  the page links a searchable archive page. When absent, cards show issue metadata only
  and no archive link — this is a deliberate degrade, not an error.

## Output

`dist/index.html` — a single self-contained HTML file (all CSS inlined in a `<style>`
block, light/dark via `prefers-color-scheme` + `data-theme` override, same pattern as
Artifact theming). One `<article class="issue">` card per issue: volume/number heading,
date range, citation string, and (if the index was available) an article list.

**PDFs are never linked from this page** — `pdf = None` is hardcoded in `build()` with
the comment `# gated: issue PDFs are subscriber-only; not published on the public site`.
The card's `'<a class="pdf" ...>'` branch exists in the template but the condition never
fires while `pdf` stays `None`. If a future subscriber-gated download flow is added,
change this deliberately — don't "fix" it by wiring the manifest's own `pdf` field back
in, since that field is legacy for internal reference/other tooling only.

Below the masthead, a fixed `archcta` banner states plainly that full index, abstracts,
and issue PDFs are moving to subscriber login and that this public page is a catalogue
(contents + citations) only.

## Adding a new issue

Add an entry to `site/issues.json`'s `issues` array (volume, number, year, date_range,
cite; `clq_folder`/`pdf` are carried through but not currently rendered as a public
download link — see above). No code change needed for a routine new-issue publish.

## Running / testing

```bash
python3 site/build-site.py --out dist            # writes dist/index.html
python3 -m http.server -d dist 8080              # preview at localhost:8080
```

```bash
cd site
pytest --cov --cov-branch --cov-fail-under=100   # 100% coverage gate, per repo CLAUDE.md
```

CLI flags: `--issues` (default `site/issues.json`), `--index` (default
`site/data/all_index.json`), `--out` (default `dist/`) — see `argparse` block at the
bottom of `build-site.py`.
