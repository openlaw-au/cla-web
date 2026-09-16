"""Usage: shared pytest fixtures for site/tests/test_build_site.py.
Scope: loads site/build-site.py as an importable module despite its hyphenated
filename (which blocks a normal `import build-site`/`import site.build_site`), and
provides small JSON fixture files under tmp_path so tests never touch the repo's
real site/issues.json, site/data/all_index.json, or dist/.
Protocol: `build_site` module fixture is loaded fresh per test via
importlib.util.spec_from_file_location so tests see a clean module each time."""
import importlib.util
import json
import pathlib

import pytest

_BUILD_SITE_PATH = pathlib.Path(__file__).parent.parent / "build-site.py"


def _load_build_site_module():
    spec = importlib.util.spec_from_file_location("build_site_under_test", _BUILD_SITE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def build_site():
    """The build-site.py module, freshly loaded via importlib for each test."""
    return _load_build_site_module()


@pytest.fixture
def issues_json(tmp_path):
    """A minimal-but-representative issues.json fixture written under tmp_path."""
    data = {
        "journal": "Test Quarterly",
        "association": "Test Association",
        "issues": [
            {
                "volume": 40,
                "number": 3,
                "year": 2026,
                "date_range": "Sep-Nov 2026",
                "cite": "(2026) 40(3) Test Quarterly",
                "clq_folder": "2026-Vol40-No3",
                "pdf": "issues/vol40-no3.pdf",
            },
            {
                "volume": 40,
                "number": 2,
                "year": 2026,
                "date_range": "Jun-Aug 2026",
                "cite": "(2026) 40(2) Test Quarterly",
                "clq_folder": "2026-Vol40-No2",
                "pdf": "issues/vol40-no2.pdf",
            },
            {
                "volume": 39,
                "number": "3-4",
                "number_label": "3-4",
                "year": 2025,
                "date_range": "Sep-Dec 2025",
                "cite": "(2025) 39(3-4) Test Quarterly",
                "clq_folder": "2025-Vol39-No3-4",
                "pdf": "issues/vol39-no3-4.pdf",
                "articles": [
                    {"title": "Inline Article <Title>", "authors": "A. Author", "category": "Article"},
                ],
            },
        ],
    }
    p = tmp_path / "issues.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


@pytest.fixture
def all_index_json(tmp_path):
    """A minimal cumulative-index fixture matching issues_json's vol/no 40/3 and 40/2."""
    data = [
        {
            "volume": 40,
            "number": 3,
            "articles": [
                {"title": "First Article", "authors": "Jane Doe", "category": "Article"},
                {"title": "A Case Note", "authors": "John Smith", "category": "Case Note"},
                {"title": "Editorial Notes", "authors": "The Editors", "category": "Editorial"},
            ],
        },
        {
            "volume": 40,
            "number": "2-special",
            "articles": [
                {"title": "Second Article", "authors": None, "category": "Article"},
            ],
        },
    ]
    p = tmp_path / "all_index.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p
