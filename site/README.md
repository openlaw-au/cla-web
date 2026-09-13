# cla-web / site — the public CLQ site

A small static site (GitHub Pages) that publishes the *Commercial Law Quarterly*: a landing
page listing the published issues with their press PDFs, and a link to the searchable
cumulative index & abstracts (Vol 1–40).

## What builds it

- **`issues.json`** — the published-issue manifest: for each issue, its `volume`, `number`,
  `year`, `date_range`, `cite`, the source folder in cla-clq (`clq_folder`), and the public
  `pdf` path the site links to.
- **`build-site.py`** — generates `dist/index.html` from `issues.json`. When
  `site/data/all_index.json` is present it fills each issue card with its article list and
  links the searchable archive. It only *presents* content — it never invents any.

The built issue PDFs and the searchable `archive.html` live in **`openlaw-au/cla-clq`**
(`index/clq_archive.html`, `issues/*/pdf/*.pdf`); the Pages workflow copies them into `dist/`
at deploy time, so nothing is duplicated in this repo.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` builds and deploys on every push to `site/**` (and on demand).
One-time setup:

1. **Settings → Pages → Source: GitHub Actions.**
2. Add a **`CLQ_REPO_TOKEN`** secret — a fine-grained PAT with read access to
   `openlaw-au/cla-clq` — so the workflow can fetch the issue PDFs and the cumulative index.

## Build locally

```bash
# fetch the index for article lists + the archive (or copy from a local cla-clq checkout)
mkdir -p site/data && cp ../cla-clq/index/all_index.json site/data/all_index.json
python3 site/build-site.py --out dist
python3 -m http.server -d dist 8080     # open http://localhost:8080/
```

## Adding an issue

Add an entry to `issues.json` (newest first is not required — the site sorts by year/volume),
point `clq_folder` at the issue folder in cla-clq, and push. The workflow copies that issue's
PDF and rebuilds.
