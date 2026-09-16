#!/usr/bin/env python3
"""Build the cla-web static site: a public CLQ landing page + issue list.

Reads:
  site/issues.json          — the published-issue manifest (metadata + PDF path)
  site/data/all_index.json  — OPTIONAL: the cumulative index (openlaw-au/cla-clq/index).
                              When present, each issue card lists its articles, and the
                              home page links the searchable archive (dist/archive.html,
                              which the Pages workflow copies from cla-clq).

Writes:
  dist/index.html           — the journal home page (masthead + issues + archive CTA)

The built issue PDFs and dist/archive.html are placed into dist/ by the Pages workflow
(they live in cla-clq); this script only generates index.html and never invents content.
"""
import json, html, pathlib, argparse, sys

HERE = pathlib.Path(__file__).parent

def esc(s):
    """Usage: HTML-escape any manifest/index value before interpolating it into the
    page template. Scope: called throughout build() for every user-authored string
    (titles, authors, citations, journal/association names). Protocol: coerces to
    str first (so ints/None are safe), treats None/falsy as "" (missing data is
    simply blank, never "None"), and always quote-escapes."""
    return html.escape(str(s or ""), quote=True)

def load(p):
    """Usage: load an optional/required JSON input file. Scope: used for both
    issues.json (manifest) and site/data/all_index.json (cumulative index).
    Protocol: returns the parsed JSON object if the path exists, else None —
    callers treat None as "this optional input was not supplied" rather than
    raising, so a missing all_index.json degrades gracefully instead of erroring."""
    p = pathlib.Path(p)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

def articles_for(index, vol, num):
    """Usage: fallback lookup of an issue's article list from the cumulative index,
    used by build() when an issue entry in issues.json has no inline "articles".
    Scope: only called when an index was loaded (build() also short-circuits via
    `it.get("articles") or articles_for(...)`). Protocol: returns [] if index is
    falsy; matches an index entry by exact volume and by number normalized via
    `int(str(...).split("-")[0])` (so "3" and "3-special"/"3-4" style labels both
    match on their leading integer); returns only articles whose category is
    "Article" or "Case Note" (editorial/other categories are excluded from the
    public page); returns [] if no matching entry is found."""
    if not index: return []
    for e in index:
        if e.get("volume") == vol and int(str(e.get("number")).split("-")[0]) == int(str(num).split("-")[0]):
            return [a for a in e.get("articles", []) if a.get("category") in ("Article", "Case Note")]
    return []

def build(issues_path, index_path, out_dir):
    """Usage: the site build entry point — reads the issues manifest (+ optional
    cumulative index) and writes dist/index.html. Scope: called by main() (the CLI)
    and directly by tests. Protocol: missing issues_path yields an empty issue list
    (never raises); issues are sorted by (year, volume, number) descending, with
    number normalized the same way as articles_for(); each issue's article list
    comes from its own "articles" field if present, else falls back to
    articles_for(index, vol, num); the per-issue PDF link is intentionally never
    rendered (pdf is hardcoded to None — issue PDFs are subscriber-gated, not
    public); an empty issue list renders a "No issues published yet." placeholder;
    the archive CTA banner is shown whenever an index was loaded (have_archive);
    creates out_dir if needed and writes exactly one file, out_dir/index.html."""
    manifest = load(issues_path) or {"issues": []}
    index = load(index_path)
    issues = sorted(manifest.get("issues", []),
                    key=lambda i: (i.get("year", 0), i.get("volume", 0), int(str(i.get("number", 0)).split("-")[0])),
                    reverse=True)
    journal = manifest.get("journal", "Commercial Law Quarterly")
    assoc = manifest.get("association", "Commercial Law Association of Australia")
    have_archive = bool(index)

    cards = []
    for it in issues:
        vol, num = it.get("volume"), it.get("number")
        label = it.get("number_label") or num
        arts = it.get("articles") or articles_for(index, vol, num)
        pdf = None  # gated: issue PDFs are subscriber-only; not published on the public site
        li = "".join(
            f'<li><span class="at">{esc(a.get("title"))}</span>'
            f'<span class="au">{esc(a.get("authors") or "")}</span></li>'
            for a in arts)
        cards.append(f'''<article class="issue">
  <div class="ih">
    <h2>Volume {esc(vol)}, No {esc(label)}</h2>
    <span class="dr">{esc(it.get("date_range") or "")}</span>
    {'<a class="pdf" href="'+esc(pdf)+'">Read PDF &#8594;</a>' if pdf else ''}
  </div>
  <div class="cite">{esc(it.get("cite") or "")}</div>
  {'<ul class="arts">'+li+'</ul>' if li else ''}
</article>''')

    archive_cta = (
      '<div class="archcta"><b>Full index, abstracts &amp; issue PDFs &#8212; for subscribers</b>'
      '<span>Access to the <i>Commercial Law Quarterly</i> and the CLA <i>Bulletin</i> is moving to subscriber login. This public page is a catalogue &#8212; contents &amp; citations &#8212; only.</span></div>')

    doc = f'''<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(journal)}</title>
<style>
  :root{{ --navy:#1B365D; --steel:#55708E; --mist:#8A97A5; --ink:#232323; --line:#e4e7ec; --bg:#f6f5f2; --card:#fff; --amber:#8a5a24; }}
  @media (prefers-color-scheme:dark){{ :root:not([data-theme="light"]){{ --navy:#9db6dc; --steel:#8ba3c0; --mist:#7f8da3; --ink:#e9edf3; --line:#2a3446; --bg:#12161d; --card:#1a212c; --amber:#d9a566; }} }}
  :root[data-theme="dark"]{{ --navy:#9db6dc; --steel:#8ba3c0; --mist:#7f8da3; --ink:#e9edf3; --line:#2a3446; --bg:#12161d; --card:#1a212c; --amber:#d9a566; }}
  *{{ box-sizing:border-box; }}
  body{{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 Georgia,"Times New Roman",serif; }}
  .wrap{{ max-width:920px; margin:0 auto; padding:0 20px; }}
  header.top{{ padding-block:44px 22px; border-bottom:2px solid var(--navy); margin-bottom:8px; }}
  header.top .kicker{{ font:600 12px/1.4 -apple-system,system-ui,sans-serif; letter-spacing:.14em; text-transform:uppercase; color:var(--steel); }}
  header.top h1{{ font-size:2.5rem; margin:.15em 0 .1em; color:var(--navy); letter-spacing:.01em; }}
  header.top p{{ margin:.2em 0 0; color:var(--steel); font-style:italic; }}
  .archcta{{ display:block; margin:22px 0 8px; padding:16px 18px; background:var(--card); border:1px solid var(--line); border-left:4px solid var(--amber); border-radius:10px; text-decoration:none; color:inherit; box-shadow:0 1px 2px rgba(20,40,70,.04); }}
  .archcta b{{ color:var(--navy); font-size:1.05rem; }} .archcta span{{ display:block; color:var(--steel); font-size:.9rem; margin-top:2px; }}
  .archcta:hover{{ border-left-color:var(--navy); }}
  h2.sec{{ font:600 12px/1.4 -apple-system,system-ui,sans-serif; letter-spacing:.12em; text-transform:uppercase; color:var(--steel); margin:30px 0 6px; }}
  .issue{{ background:var(--card); border:1px solid var(--line); border-radius:10px; padding:18px 20px; margin:14px 0; box-shadow:0 1px 2px rgba(20,40,70,.04); }}
  .issue .ih{{ display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }}
  .issue h2{{ font-size:1.25rem; color:var(--navy); margin:0; }}
  .issue .dr{{ color:var(--mist); font-size:.9rem; }}
  .issue .pdf{{ margin-left:auto; font:600 13px/1 -apple-system,system-ui,sans-serif; color:#fff; background:var(--navy); text-decoration:none; padding:7px 12px; border-radius:7px; }}
  .issue .cite{{ color:var(--steel); font-size:.86rem; margin:4px 0 2px; }}
  ul.arts{{ list-style:none; margin:10px 0 0; padding:0; border-top:1px solid var(--line); }}
  ul.arts li{{ padding:7px 0; border-bottom:1px solid var(--line); }}
  ul.arts .at{{ display:block; }} ul.arts .au{{ display:block; color:var(--steel); font-size:.86rem; }}
  footer{{ color:var(--mist); font-size:.82rem; border-top:1px solid var(--line); margin-top:34px; padding-block:20px 40px; }}
  a{{ color:var(--navy); }}
</style>
<div class="wrap">
  <header class="top">
    <div class="kicker">{esc(assoc)}</div>
    <h1>{esc(journal)}</h1>
    <p>Scholarship in commercial law &#8212; published quarterly.</p>
  </header>
  {archive_cta}
  <h2 class="sec">Issues</h2>
  {''.join(cards) if cards else '<p>No issues published yet.</p>'}
  <footer>
    {esc(journal)} is the journal of the {esc(assoc)}. Built PDFs come from
    <code>openlaw-au/cla-clq</code>; typesetting from <code>cla-tamara-print</code>.
  </footer>
</div>
'''
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(doc, encoding="utf-8")
    print(f"wrote {out/'index.html'} — {len(issues)} issue(s); archive linked: {have_archive}")

def main(argv=None):
    """Usage: CLI entry point for build-site.py. Scope: invoked by
    `if __name__ == "__main__"` (argv=None, so argparse parses sys.argv[1:]) and by
    the Pages workflow (`python3 site/build-site.py --out dist`); also directly
    callable from tests with an explicit argv list. Protocol: defines the three
    flags --issues/--index/--out with the same HERE-relative defaults as before
    (site/issues.json, site/data/all_index.json, dist/ next to site/), parses
    `argv if argv is not None else sys.argv[1:]`, then delegates to build()."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--issues", default=str(HERE / "issues.json"))
    ap.add_argument("--index", default=str(HERE / "data" / "all_index.json"))
    ap.add_argument("--out", default=str(HERE.parent / "dist"))
    a = ap.parse_args(argv if argv is not None else sys.argv[1:])
    build(a.issues, a.index, a.out)

if __name__ == "__main__":
    main()
