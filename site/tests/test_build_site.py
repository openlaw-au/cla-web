"""Usage: full behavioural test suite for site/build-site.py (targets 100% branch
coverage). Scope: esc, load, articles_for, build, main — every function in the
module. Protocol: all fixture files and outputs live under pytest's tmp_path; no
test ever reads/writes the repo's real site/issues.json, site/data/all_index.json,
or dist/."""
import json
import sys

# ---------------------------------------------------------------------------
# esc
# ---------------------------------------------------------------------------


def test_esc_html_escapes_special_characters(build_site):
    assert build_site.esc("<b>\"quoted\" & 'apos'</b>") == ("&lt;b&gt;&quot;quoted&quot; &amp; &#x27;apos&#x27;&lt;/b&gt;")


def test_esc_none_returns_empty_string(build_site):
    assert build_site.esc(None) == ""


def test_esc_falsy_non_none_returns_empty_string(build_site):
    # esc(s or "") treats any falsy value (0, "", False) the same as None.
    assert build_site.esc("") == ""
    assert build_site.esc(0) == ""


def test_esc_coerces_non_string_to_string(build_site):
    assert build_site.esc(42) == "42"


# ---------------------------------------------------------------------------
# load
# ---------------------------------------------------------------------------


def test_load_reads_existing_json_file(build_site, tmp_path):
    p = tmp_path / "data.json"
    p.write_text(json.dumps({"a": 1}), encoding="utf-8")
    assert build_site.load(p) == {"a": 1}


def test_load_reads_existing_json_file_from_str_path(build_site, tmp_path):
    p = tmp_path / "data.json"
    p.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
    assert build_site.load(str(p)) == [1, 2, 3]


def test_load_returns_none_when_file_missing(build_site, tmp_path):
    missing = tmp_path / "does_not_exist.json"
    assert build_site.load(missing) is None


# ---------------------------------------------------------------------------
# articles_for
# ---------------------------------------------------------------------------


def test_articles_for_empty_index_returns_empty_list(build_site):
    assert build_site.articles_for(None, 40, 3) == []
    assert build_site.articles_for([], 40, 3) == []


def test_articles_for_matches_volume_and_number(build_site):
    index = [
        {
            "volume": 40,
            "number": 3,
            "articles": [
                {"title": "Match", "category": "Article"},
            ],
        },
    ]
    result = build_site.articles_for(index, 40, 3)
    assert result == [{"title": "Match", "category": "Article"}]


def test_articles_for_normalizes_hyphenated_number_labels(build_site):
    # index entry's number is "2-special"; querying with plain int 2 must still match
    # via int(str(...).split("-")[0]) normalization on both sides.
    index = [
        {
            "volume": 40,
            "number": "2-special",
            "articles": [
                {"title": "Hyphen Match", "category": "Article"},
            ],
        },
    ]
    assert build_site.articles_for(index, 40, 2) == [{"title": "Hyphen Match", "category": "Article"}]
    # and the reverse: query number itself hyphenated, matching a plain int entry
    index2 = [
        {
            "volume": 40,
            "number": 3,
            "articles": [
                {"title": "Hyphen Query Match", "category": "Article"},
            ],
        },
    ]
    assert build_site.articles_for(index2, 40, "3-4") == [{"title": "Hyphen Query Match", "category": "Article"}]


def test_articles_for_filters_to_article_and_case_note_categories(build_site):
    index = [
        {
            "volume": 40,
            "number": 3,
            "articles": [
                {"title": "An Article", "category": "Article"},
                {"title": "A Case Note", "category": "Case Note"},
                {"title": "An Editorial", "category": "Editorial"},
                {"title": "No Category"},
            ],
        },
    ]
    result = build_site.articles_for(index, 40, 3)
    titles = [a["title"] for a in result]
    assert titles == ["An Article", "A Case Note"]


def test_articles_for_no_matching_entry_returns_empty_list(build_site):
    index = [{"volume": 1, "number": 1, "articles": [{"title": "x", "category": "Article"}]}]
    assert build_site.articles_for(index, 99, 99) == []


def test_articles_for_volume_matches_but_number_does_not(build_site):
    index = [{"volume": 40, "number": 5, "articles": [{"title": "x", "category": "Article"}]}]
    assert build_site.articles_for(index, 40, 3) == []


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------


def test_build_writes_index_html_to_out_dir(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    out_file = out_dir / "index.html"
    assert out_file.exists()
    html = out_file.read_text(encoding="utf-8")
    assert "<!doctype html>" in html
    assert "Test Quarterly" in html
    assert "Test Association" in html


def test_build_sorts_issues_by_year_volume_number_descending(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    # issues_json fixture has (2026,40,3), (2026,40,2), (2025,39,"3-4") — reverse sort
    # should put 40/3 first, then 40/2, then 39/3-4 last.
    pos_40_3 = html.index("Volume 40, No 3")
    pos_40_2 = html.index("Volume 40, No 2")
    pos_39 = html.index("Volume 39, No 3-4")
    assert pos_40_3 < pos_40_2 < pos_39


def test_build_archive_cta_present_when_index_given(build_site, issues_json, all_index_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(all_index_json), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "archcta" in html
    assert "Full index, abstracts" in html


def test_build_archive_cta_absent_marker_when_no_index(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    missing_index = tmp_path / "no_index.json"
    build_site.build(str(issues_json), str(missing_index), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    # have_archive is False, but the archcta div is still unconditionally in the
    # template (bool(index) only controls the printed "archive linked" flag /
    # semantics elsewhere) -- assert what actually varies: no index means no
    # index-only article lists are pulled in via articles_for fallback for
    # issues lacking inline "articles".
    assert "Full index, abstracts" in html  # archcta text is static, always rendered
    # Issue 40/2 has no inline "articles" and no index available -> no <ul class="arts">
    # for that specific issue. Verify via absence of its would-be fallback content.
    idx_40_2 = html.index("Volume 40, No 2")
    idx_39 = html.index("Volume 39, No 3-4")
    segment_40_2 = html[idx_40_2:idx_39]
    assert "arts" not in segment_40_2


def test_build_per_issue_cards_render_metadata(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "(2026) 40(3) Test Quarterly" in html
    assert "Sep-Nov 2026" in html


def test_build_pdf_gating_no_read_pdf_link(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "Read PDF" not in html
    assert 'class="pdf"' not in html


def test_build_empty_issues_shows_placeholder(build_site, tmp_path):
    empty_manifest = tmp_path / "empty_issues.json"
    empty_manifest.write_text(json.dumps({"journal": "J", "association": "A", "issues": []}), encoding="utf-8")
    out_dir = tmp_path / "dist_out"
    build_site.build(str(empty_manifest), str(tmp_path / "no_index.json"), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "No issues published yet." in html


def test_build_missing_issues_file_yields_empty_issues(build_site, tmp_path):
    # load() returns None for a missing issues_path; build() falls back to
    # {"issues": []} via `manifest = load(issues_path) or {"issues": []}`.
    missing = tmp_path / "missing_issues.json"
    out_dir = tmp_path / "dist_out"
    build_site.build(str(missing), str(tmp_path / "no_index.json"), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "No issues published yet." in html
    # defaults for journal/association apply
    assert "Commercial Law Quarterly" in html
    assert "Commercial Law Association of Australia" in html


def test_build_articles_from_issue_inline_articles_field(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    # issue 39/3-4 has inline "articles" -- should render without needing an index
    assert "Inline Article &lt;Title&gt;" in html
    assert "A. Author" in html


def test_build_articles_fallback_to_articles_for_when_no_inline_articles(build_site, issues_json, all_index_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(all_index_json), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    # issue 40/3 has no inline "articles" in issues_json fixture, so it falls back
    # to articles_for(index, 40, 3) which (per all_index_json fixture) yields the
    # Article + Case Note but excludes the Editorial category.
    assert "First Article" in html
    assert "A Case Note" in html
    assert "Editorial Notes" not in html


def test_build_article_with_missing_authors_renders_empty_authors(build_site, issues_json, all_index_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(all_index_json), str(out_dir))
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    # 40/2-special article has authors=None -> esc(None or "") == ""
    assert "Second Article" in html


def test_build_creates_out_dir_if_missing(build_site, issues_json, tmp_path):
    out_dir = tmp_path / "nested" / "does" / "not" / "exist"
    assert not out_dir.exists()
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    assert (out_dir / "index.html").exists()


def test_build_prints_summary_line(build_site, issues_json, tmp_path, capsys):
    out_dir = tmp_path / "dist_out"
    build_site.build(str(issues_json), str(tmp_path / "no_index.json"), str(out_dir))
    captured = capsys.readouterr()
    assert "wrote" in captured.out
    assert "index.html" in captured.out
    assert "3 issue(s)" in captured.out
    assert "archive linked: False" in captured.out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def test_main_with_explicit_argv_writes_index_html(build_site, issues_json, all_index_json, tmp_path):
    out_dir = tmp_path / "dist_out"
    build_site.main(
        [
            "--issues",
            str(issues_json),
            "--index",
            str(all_index_json),
            "--out",
            str(out_dir),
        ]
    )
    assert (out_dir / "index.html").exists()
    html = (out_dir / "index.html").read_text(encoding="utf-8")
    assert "Test Quarterly" in html


def test_main_with_argv_none_uses_sys_argv(build_site, issues_json, all_index_json, tmp_path, monkeypatch):
    out_dir = tmp_path / "dist_out_sysargv"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "build-site.py",
            "--issues",
            str(issues_json),
            "--index",
            str(all_index_json),
            "--out",
            str(out_dir),
        ],
    )
    build_site.main()
    assert (out_dir / "index.html").exists()


def test_main_defaults_resolve_relative_to_module_location(build_site, monkeypatch, tmp_path, issues_json):
    # With no --issues/--index/--out given at all, argparse falls back to the
    # HERE-relative defaults baked into main(). Repoint HERE (module-level, set at
    # import time from build-site.py's real location) at a tmp_path sandbox before
    # calling main([]), so the default branch executes for real without ever
    # touching the repo's real site/issues.json or dist/.
    sandbox_here = tmp_path / "sandboxed_site"
    sandbox_here.mkdir()
    (sandbox_here / "data").mkdir()
    (sandbox_here / "issues.json").write_text(issues_json.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(build_site, "HERE", sandbox_here)

    build_site.main([])

    out_file = sandbox_here.parent / "dist" / "index.html"
    assert out_file.exists()
    html = out_file.read_text(encoding="utf-8")
    assert "Test Quarterly" in html
