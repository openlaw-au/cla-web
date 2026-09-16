/**
 * ProofingEditor.test.tsx
 *
 * Usage scope: Vitest + @testing-library/react tests for `components/ProofingEditor.tsx`.
 *
 * Purpose: End-to-end behavioural coverage of the assembled CLQ Proofing Editor UI — the
 * toolbar, the mounted ProseMirror `EditorView`, the "Selected footnote" panel, the Markdown
 * in/out panel (Load/Export/Download), and the GitHub load/save panel (including `localStorage`
 * persistence of repo/path/branch but never the token, and both success and error paths).
 * `global.fetch` is mocked per-test with `vi.fn()` so no test touches the network; `URL.
 * createObjectURL` is stubbed since jsdom doesn't implement it.
 *
 * Protocol: covers every branch in ProofingEditor.tsx to satisfy the repo's 100% line+branch
 * coverage gate (see `CLAUDE.md`). The one exception is the `EditorView` mount failure path,
 * exercised by mocking `prosemirror-view`'s `EditorView` constructor to throw for a single test
 * (real EditorView mount failures — e.g. a corrupt schema — aren't otherwise reachable from a
 * black-box render).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProofingEditor from "./ProofingEditor";
import { SAMPLE } from "../lib/editor/sample";

const GH_STORAGE_KEY = "clq-editor-gh";

beforeEach(() => {
  window.localStorage.clear();
  // jsdom doesn't implement createObjectURL/revokeObjectURL.
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:mock"), writable: true });
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Finds the mounted ProseMirror root. */
function getPmRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector(".ProseMirror");
  if (!el) throw new Error("ProseMirror root not found");
  return el as HTMLElement;
}

/**
 * The underlying CommonMark parser (markdown-it + prosemirror-markdown) is deliberately lenient
 * — it has no organic input that makes `parseMarkdown()` throw (unrecognised syntax degrades to
 * plain text rather than erroring). `handleLoad`'s and `handleGhLoad`'s catch branches are still
 * real, load-bearing code (the same reason `editor/app.js`'s equivalents existed — a future
 * markdown extension or a hand-edited GitHub file could trigger them), so they're exercised by
 * mocking `lib/editor/markdown`'s `parseMarkdown` to throw `toThrow` on every call after the
 * first (the first call seeds the initial document on mount and must succeed for real). Returns
 * the freshly re-imported `ProofingEditor` component; caller must `vi.doUnmock(...)` +
 * `vi.resetModules()` afterward.
 */
async function mockParseMarkdownToThrowAfterMount(toThrow: unknown) {
  vi.resetModules();
  vi.doMock("../lib/editor/markdown", async () => {
    const actual = await vi.importActual<typeof import("../lib/editor/markdown")>(
      "../lib/editor/markdown",
    );
    let calls = 0;
    return {
      ...actual,
      parseMarkdown: (text: string) => {
        calls++;
        if (calls === 1) return actual.parseMarkdown(text);
        throw toThrow;
      },
    };
  });
  const { default: MockedProofingEditor } = await import("./ProofingEditor");
  return MockedProofingEditor;
}

describe("ProofingEditor", () => {
  it("renders the toolbar buttons (Bold, Italic, SC, headings, lists, Footnote, Undo, Redo)", () => {
    render(<ProofingEditor />);
    for (const label of [
      "Bold",
      "Italic",
      "SC",
      "H1",
      "H2",
      "H3",
      "¶",
      "Quote",
      "• List",
      "1. List",
      "Footnote",
      "Undo",
      "Redo",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("mounts a .ProseMirror element seeded from SAMPLE and reports Ready status", () => {
    const { container } = render(<ProofingEditor />);
    const pm = getPmRoot(container);
    expect(pm).toBeInTheDocument();
    expect(pm.textContent).toContain("Recent developments in financial services law");
    expect(screen.getByText(/Ready\. Edit above/)).toBeInTheDocument();
  });

  it("numbers footnotes in document order via the numbering plugin, after the first update", () => {
    // ProseMirror only calls a plugin view's update() from the *second* state transition onward
    // (the initial construction just instantiates plugin views, matching editor/app.js's own
    // numberPlugin) — so footnotes show the node view's literal "fn" label until the first
    // dispatched transaction, then renumber. Clicking Footnote inserts a 3rd footnote and forces
    // that first update.
    const { container } = render(<ProofingEditor />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Footnote" }));
    const sups = container.querySelectorAll("sup.clq-fn");
    expect(Array.from(sups).map((el) => el.textContent)).toEqual(["1", "2", "3"]);
  });

  it("a toolbar button mousedown runs its command against the view and refocuses it", () => {
    const { container } = render(<ProofingEditor />);
    const pm = getPmRoot(container);
    pm.focus();

    const boldBtn = screen.getByRole("button", { name: "Bold" });
    // mousedown (not click) is what the component listens for, matching the legacy handler.
    fireEvent.mouseDown(boldBtn);

    expect(document.activeElement).toBe(pm);
  });

  it("clicking Export serializes the current document into the Markdown textarea", async () => {
    const user = userEvent.setup();
    render(<ProofingEditor />);
    const exportBtn = screen.getByRole("button", { name: "◂ Export Markdown" });
    await user.click(exportBtn);

    const mdTextarea = screen.getByPlaceholderText(/paste an article's Markdown here/i);
    expect((mdTextarea as HTMLTextAreaElement).value).toContain(
      "Recent developments in financial services law",
    );
    expect(screen.getByText("Exported Markdown.")).toBeInTheDocument();
  });

  it("typing markdown into the in-textarea and clicking Load replaces the document", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProofingEditor />);
    const mdTextarea = screen.getByPlaceholderText(
      /paste an article's Markdown here/i,
    ) as HTMLTextAreaElement;

    await user.clear(mdTextarea);
    fireEvent.change(mdTextarea, { target: { value: "# Brand new heading\n\nSome body text." } });

    const loadBtn = screen.getByRole("button", { name: "Load into editor ▸" });
    await user.click(loadBtn);

    const pm = getPmRoot(container);
    expect(pm.textContent).toContain("Brand new heading");
    expect(pm.textContent).toContain("Some body text.");
    expect(screen.getByText("Loaded.")).toBeInTheDocument();
  });

  it("clicking Load with an empty textarea shows a status message and does not touch the doc", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProofingEditor />);
    const pmBefore = getPmRoot(container).textContent;

    const loadBtn = screen.getByRole("button", { name: "Load into editor ▸" });
    await user.click(loadBtn);

    expect(screen.getByText("Paste some Markdown first.")).toBeInTheDocument();
    expect(getPmRoot(container).textContent).toBe(pmBefore);
  });

  it("clicking Load with unparsable markdown shows a Parse error status (Error thrown)", async () => {
    const MockedProofingEditor = await mockParseMarkdownToThrowAfterMount(new Error("mock parse failure"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    render(<MockedProofingEditor />);
    const mdTextarea = screen.getByPlaceholderText(
      /paste an article's Markdown here/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(mdTextarea, { target: { value: "some markdown" } });
    const loadBtn = screen.getByRole("button", { name: "Load into editor ▸" });
    await user.click(loadBtn);

    expect(screen.getByText("Parse error: mock parse failure")).toBeInTheDocument();
    errSpy.mockRestore();
    vi.doUnmock("../lib/editor/markdown");
    vi.resetModules();
  });

  it("clicking Load with unparsable markdown shows a Parse error status (non-Error value thrown)", async () => {
    const MockedProofingEditor = await mockParseMarkdownToThrowAfterMount("plain string failure");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    render(<MockedProofingEditor />);
    const mdTextarea = screen.getByPlaceholderText(
      /paste an article's Markdown here/i,
    ) as HTMLTextAreaElement;
    fireEvent.change(mdTextarea, { target: { value: "some markdown" } });
    const loadBtn = screen.getByRole("button", { name: "Load into editor ▸" });
    await user.click(loadBtn);

    expect(screen.getByText("Parse error: plain string failure")).toBeInTheDocument();
    errSpy.mockRestore();
    vi.doUnmock("../lib/editor/markdown");
    vi.resetModules();
  });

  it("clicking Download triggers a Blob download via URL.createObjectURL", async () => {
    const user = userEvent.setup();
    render(<ProofingEditor />);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const downloadBtn = screen.getByRole("button", { name: "Download .md" });
    await user.click(downloadBtn);

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it("selecting a footnote (mousedown on the marker) populates the footnote textarea, and editing it updates the doc", () => {
    const { container } = render(<ProofingEditor />);
    const pm = getPmRoot(container);
    const sup = container.querySelector("sup.clq-fn") as HTMLElement;
    expect(sup).toBeTruthy();

    fireEvent.mouseDown(sup);

    const fnTextarea = screen.getByPlaceholderText(/Select a footnote/i) as HTMLTextAreaElement;
    expect(fnTextarea).not.toBeDisabled();
    expect(fnTextarea.value.length).toBeGreaterThan(0);
    expect(sup.classList.contains("sel")).toBe(true);

    // setNodeMarkup replaces the footnote node with a new instance carrying the edited text,
    // which invalidates the NodeSelection over the old instance — ProseMirror's node view
    // lifecycle tears down/rebuilds and deselects, exactly as it does against the legacy
    // editor/app.js's identical setNodeMarkup call. The document update (the node's title/text
    // attr) is what matters here, not the transient selection highlight surviving the edit.
    fireEvent.change(fnTextarea, { target: { value: "Edited footnote text." } });
    expect(sup.title).toBe("Edited footnote text.");
    expect(pm).toBeInTheDocument();
  });

  it("the footnote textarea is disabled with no selection, and editing it while unselected is a no-op", () => {
    render(<ProofingEditor />);
    const fnTextarea = screen.getByPlaceholderText(/Select a footnote/i) as HTMLTextAreaElement;
    expect(fnTextarea).toBeDisabled();
    // Programmatically firing change while disabled still exercises handleFootnoteTextChange's
    // early-return branch (selectedPos == null).
    fireEvent.change(fnTextarea, { target: { value: "ignored" } });
    expect(fnTextarea.value).toBe("ignored");
  });

  it("deselecting a footnote (moving selection elsewhere) clears the footnote panel", () => {
    const { container } = render(<ProofingEditor />);
    const sup = container.querySelector("sup.clq-fn") as HTMLElement;
    fireEvent.mouseDown(sup);

    const fnTextarea = screen.getByPlaceholderText(/Select a footnote/i) as HTMLTextAreaElement;
    expect(fnTextarea).not.toBeDisabled();

    // jsdom has no layout engine, so a synthetic mousedown/click can't resolve a real text
    // position via posAtCoords (ProseMirror's coordinate-to-position lookup) the way a real
    // browser click would. Pressing ArrowRight instead deterministically moves the selection
    // off the NodeSelection and onto a TextSelection just past it, via ProseMirror's own base
    // keymap — which fires the same deselectNode() lifecycle a real click-away would.
    const pm = getPmRoot(container);
    fireEvent.keyDown(pm, { key: "ArrowRight", code: "ArrowRight", keyCode: 39 });

    expect(sup.classList.contains("sel")).toBe(false);
    expect(screen.getByPlaceholderText(/Select a footnote/i)).toBeDisabled();
  });

  it("clicking the Footnote toolbar button inserts a new footnote and renumbers", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProofingEditor />);
    const before = container.querySelectorAll("sup.clq-fn").length;

    const footnoteBtn = screen.getByRole("button", { name: "Footnote" });
    fireEvent.mouseDown(footnoteBtn);

    const after = container.querySelectorAll("sup.clq-fn").length;
    expect(after).toBe(before + 1);
    void user; // user-event not otherwise needed here; mousedown is the real trigger.
  });

  describe("GitHub panel", () => {
    function ghInputs() {
      return {
        repo: screen.getByPlaceholderText("openlaw-au/cla-clq") as HTMLInputElement,
        path: screen.getByPlaceholderText(/issues\/2026-Vol40-No3/) as HTMLInputElement,
        branch: screen.getByPlaceholderText("main") as HTMLInputElement,
        token: screen.getByPlaceholderText(/github_pat_/) as HTMLInputElement,
      };
    }

    it("loads persisted repo/path/branch from localStorage on mount, but never the token", () => {
      window.localStorage.setItem(
        GH_STORAGE_KEY,
        JSON.stringify({ repo: "openlaw-au/cla-clq", path: "issues/x.md", branch: "release" }),
      );
      render(<ProofingEditor />);
      const { repo, path, branch, token } = ghInputs();
      expect(repo.value).toBe("openlaw-au/cla-clq");
      expect(path.value).toBe("issues/x.md");
      expect(branch.value).toBe("release");
      expect(token.value).toBe("");
    });

    it("tolerates missing localStorage data (fields stay blank)", () => {
      render(<ProofingEditor />);
      const { repo, path, branch } = ghInputs();
      expect(repo.value).toBe("");
      expect(path.value).toBe("");
      expect(branch.value).toBe("");
    });

    it("tolerates unparsable JSON in localStorage (fields stay blank)", () => {
      window.localStorage.setItem(GH_STORAGE_KEY, "{not json");
      render(<ProofingEditor />);
      const { repo } = ghInputs();
      expect(repo.value).toBe("");
    });

    it("tolerates a non-object JSON value in localStorage (fields stay blank)", () => {
      window.localStorage.setItem(GH_STORAGE_KEY, JSON.stringify("just a string"));
      render(<ProofingEditor />);
      const { repo } = ghInputs();
      expect(repo.value).toBe("");
    });

    it("tolerates localStorage.getItem throwing (private mode) — fields stay blank", () => {
      const spy = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });
      render(<ProofingEditor />);
      const { repo } = ghInputs();
      expect(repo.value).toBe("");
      spy.mockRestore();
    });

    it("tolerates localStorage.setItem throwing (private mode) when persisting fields", async () => {
      const user = userEvent.setup();
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const content = Buffer.from("# ok", "utf-8").toString("base64");
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ content, sha: "abc" }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<ProofingEditor />);
      const { repo, path } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      // rememberGh()'s write throws internally but is swallowed, so the load still succeeds.
      await expect(user.click(loadBtn)).resolves.toBeUndefined();
      expect(screen.getByText(/^Loaded issues\/a\.md @/)).toBeInTheDocument();

      setItemSpy.mockRestore();
    });

    it("shows a validation error and does not call fetch when the repo field is invalid", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<ProofingEditor />);
      const { repo, path } = ghInputs();
      await user.type(repo, "not-a-repo");
      await user.type(path, "a.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(
        screen.getByText("Repository must be owner/name, e.g. openlaw-au/cla-clq."),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("parseCurrentGhParts's catch branch stringifies a non-Error throw from parseGhParts", async () => {
      // parseGhParts (lib/editor/github.ts) only ever throws real Error instances from real
      // invalid input, so the `: String(err)` fallback half of parseCurrentGhParts's ternary is
      // mocked here rather than reached organically.
      vi.resetModules();
      vi.doMock("../lib/editor/github", async () => {
        const actual = await vi.importActual<typeof import("../lib/editor/github")>(
          "../lib/editor/github",
        );
        return {
          ...actual,
          parseGhParts: () => {
            throw "plain string validation failure";
          },
        };
      });
      const { default: MockedProofingEditor } = await import("./ProofingEditor");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const user = userEvent.setup();
      render(<MockedProofingEditor />);
      const repo = screen.getByPlaceholderText("openlaw-au/cla-clq") as HTMLInputElement;
      const path = screen.getByPlaceholderText(/issues\/2026-Vol40-No3/) as HTMLInputElement;
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "a.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(screen.getByText("plain string validation failure")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      vi.doUnmock("../lib/editor/github");
      vi.resetModules();
    });

    it("Load from GitHub: success path fetches, replaces the doc, persists fields, and shows sha", async () => {
      const user = userEvent.setup();
      const content = Buffer.from(
        "# Loaded from GitHub\n\nBody text.",
        "utf-8",
      ).toString("base64");
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ content, sha: "abcdef1234567" }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      const { container } = render(<ProofingEditor />);
      const { repo, path } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as unknown as [string];
      expect(url).toContain("https://api.github.com/repos/openlaw-au/cla-clq/contents/issues/a.md");

      expect(getPmRoot(container).textContent).toContain("Loaded from GitHub");
      expect(screen.getByText(/^Loaded issues\/a\.md @ abcdef1\./)).toBeInTheDocument();
      expect(screen.getByText(/^Loaded issues\/a\.md from openlaw-au\/cla-clq\./)).toBeInTheDocument();

      const stored = JSON.parse(window.localStorage.getItem(GH_STORAGE_KEY) || "{}");
      // rememberGh persists the raw (un-defaulted) branch field, matching editor/app.js's
      // rememberGh() — an intentionally blank branch field stays "" in storage, not "main".
      expect(stored).toEqual({ repo: "openlaw-au/cla-clq", path: "issues/a.md", branch: "" });
    });

    it("Load from GitHub: error response shows the GitHub error message", async () => {
      const user = userEvent.setup();
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ message: "Not Found in repo" }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<ProofingEditor />);
      const { repo, path } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/missing.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(screen.getByText("GitHub 404: Not Found in repo")).toBeInTheDocument();
      errSpy.mockRestore();
    });

    it("Load from GitHub: a parse error in the loaded content shows the error message (handleGhLoad's catch branch, Error thrown)", async () => {
      // Same rationale as the plain "Load into editor" parse-error tests above: the CommonMark
      // parser has no organic throwing input, so parseMarkdown is mocked to throw for this one
      // test, specifically to exercise handleGhLoad's own try/catch (distinct from handleLoad's).
      const MockedProofingEditor = await mockParseMarkdownToThrowAfterMount(
        new Error("mock gh parse failure"),
      );
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const user = userEvent.setup();
      const content = Buffer.from("# some content", "utf-8").toString("base64");
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ content, sha: "deadbeef" }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<MockedProofingEditor />);
      const repo = screen.getByPlaceholderText("openlaw-au/cla-clq") as HTMLInputElement;
      const path = screen.getByPlaceholderText(/issues\/2026-Vol40-No3/) as HTMLInputElement;
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/bad.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(screen.getByText("mock gh parse failure")).toBeInTheDocument();
      errSpy.mockRestore();
      vi.doUnmock("../lib/editor/markdown");
      vi.resetModules();
    });

    it("Load from GitHub: a parse error in the loaded content shows the error message (handleGhLoad's catch branch, non-Error value thrown)", async () => {
      const MockedProofingEditor = await mockParseMarkdownToThrowAfterMount("plain gh failure");
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const user = userEvent.setup();
      const content = Buffer.from("# some content", "utf-8").toString("base64");
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ content, sha: "deadbeef" }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<MockedProofingEditor />);
      const repo = screen.getByPlaceholderText("openlaw-au/cla-clq") as HTMLInputElement;
      const path = screen.getByPlaceholderText(/issues\/2026-Vol40-No3/) as HTMLInputElement;
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/bad.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(screen.getByText("plain gh failure")).toBeInTheDocument();
      errSpy.mockRestore();
      vi.doUnmock("../lib/editor/markdown");
      vi.resetModules();
    });

    it("Load from GitHub: response omitting sha falls back to an empty string in the status message", async () => {
      const user = userEvent.setup();
      const content = Buffer.from("# ok", "utf-8").toString("base64");
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ content }), // no sha field
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<ProofingEditor />);
      const { repo, path } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");

      const loadBtn = screen.getByRole("button", { name: "Load from GitHub ▸" });
      await user.click(loadBtn);

      expect(screen.getByText("Loaded issues/a.md @ .")).toBeInTheDocument();
    });

    it("Save to GitHub: requires a token", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<ProofingEditor />);
      const { repo, path } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");

      const saveBtn = screen.getByRole("button", { name: "◂ Save to GitHub" });
      await user.click(saveBtn);

      expect(
        screen.getByText("A token with repo write scope is required to save."),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Save to GitHub: validation error (bad repo) short-circuits before the token check", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<ProofingEditor />);
      const { repo, path, token } = ghInputs();
      await user.type(repo, "bad repo no slash");
      await user.type(path, "a.md");
      await user.type(token, "ghp_x");

      const saveBtn = screen.getByRole("button", { name: "◂ Save to GitHub" });
      await user.click(saveBtn);

      expect(
        screen.getByText("Repository must be owner/name, e.g. openlaw-au/cla-clq."),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Save to GitHub: success path PUTs the serialized doc, persists fields, and shows the commit sha", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ content: { sha: "newsha1234567" }, commit: { sha: "commitsha1234567" } }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<ProofingEditor />);
      const { repo, path, branch, token } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");
      await user.type(branch, "release/v2");
      await user.type(token, "ghp_abc123");

      const saveBtn = screen.getByRole("button", { name: "◂ Save to GitHub" });
      await user.click(saveBtn);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/openlaw-au/cla-clq/contents/issues/a.md");
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body as string);
      expect(body.branch).toBe("release/v2");
      expect(body.message).toBe("Proof: issues/a.md (CLQ editor)");

      expect(screen.getByText(/^Saved — commit commits\./)).toBeInTheDocument();
      expect(
        screen.getByText(/^Saved issues\/a\.md to openlaw-au\/cla-clq \(release\/v2\)\./),
      ).toBeInTheDocument();

      const stored = JSON.parse(window.localStorage.getItem(GH_STORAGE_KEY) || "{}");
      expect(stored).toEqual({ repo: "openlaw-au/cla-clq", path: "issues/a.md", branch: "release/v2" });
    });

    it("Save to GitHub: error response shows the GitHub error message", async () => {
      const user = userEvent.setup();
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => ({ message: "sha does not match" }),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<ProofingEditor />);
      const { repo, path, token } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");
      await user.type(token, "ghp_stale");

      const saveBtn = screen.getByRole("button", { name: "◂ Save to GitHub" });
      await user.click(saveBtn);

      expect(screen.getByText("GitHub 422: sha does not match")).toBeInTheDocument();
      errSpy.mockRestore();
    });

    it("handleGhSave's catch branch stringifies a non-Error throw from saveFile", async () => {
      // saveFile (lib/editor/github.ts) only ever rejects with real Error instances (via ghErr),
      // so the `: String(err)` fallback half of handleGhSave's ternary is mocked here rather
      // than reached organically.
      vi.resetModules();
      vi.doMock("../lib/editor/github", async () => {
        const actual = await vi.importActual<typeof import("../lib/editor/github")>(
          "../lib/editor/github",
        );
        return {
          ...actual,
          saveFile: async () => {
            throw "plain string save failure";
          },
        };
      });
      const { default: MockedProofingEditor } = await import("./ProofingEditor");
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const user = userEvent.setup();
      render(<MockedProofingEditor />);
      const repo = screen.getByPlaceholderText("openlaw-au/cla-clq") as HTMLInputElement;
      const path = screen.getByPlaceholderText(/issues\/2026-Vol40-No3/) as HTMLInputElement;
      const token = screen.getByPlaceholderText(/github_pat_/) as HTMLInputElement;
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");
      await user.type(token, "ghp_x");

      const saveBtn = screen.getByRole("button", { name: "◂ Save to GitHub" });
      await user.click(saveBtn);

      expect(screen.getByText("plain string save failure")).toBeInTheDocument();
      errSpy.mockRestore();
      vi.doUnmock("../lib/editor/github");
      vi.resetModules();
    });

    it("Save to GitHub: response omitting sha/commit falls back to empty strings", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
      }));
      vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

      render(<ProofingEditor />);
      const { repo, path, token } = ghInputs();
      await user.type(repo, "openlaw-au/cla-clq");
      await user.type(path, "issues/a.md");
      await user.type(token, "ghp_x");

      const saveBtn = screen.getByRole("button", { name: "◂ Save to GitHub" });
      await user.click(saveBtn);

      expect(screen.getByText("Saved — commit .")).toBeInTheDocument();
    });
  });

  it("unmounts cleanly, destroying the EditorView without throwing", () => {
    const { unmount, container } = render(<ProofingEditor />);
    expect(getPmRoot(container)).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  it("shows an 'Editor failed to load' status when mounting the EditorView throws an Error", async () => {
    vi.resetModules();
    vi.doMock("prosemirror-view", async () => {
      const actual = await vi.importActual<typeof import("prosemirror-view")>("prosemirror-view");
      return {
        ...actual,
        EditorView: class {
          constructor() {
            throw new Error("boom");
          }
        },
      };
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: BrokenProofingEditor } = await import("./ProofingEditor");
    render(<BrokenProofingEditor />);

    expect(screen.getByText(/^Editor failed to load: boom/)).toBeInTheDocument();
    errSpy.mockRestore();
    vi.doUnmock("prosemirror-view");
    vi.resetModules();
  });

  it("shows an 'Editor failed to load' status when mounting the EditorView throws a non-Error value", async () => {
    vi.resetModules();
    vi.doMock("prosemirror-view", async () => {
      const actual = await vi.importActual<typeof import("prosemirror-view")>("prosemirror-view");
      return {
        ...actual,
        EditorView: class {
          constructor() {
            throw "not an Error object";
          }
        },
      };
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { default: BrokenProofingEditor } = await import("./ProofingEditor");
    render(<BrokenProofingEditor />);

    expect(screen.getByText(/^Editor failed to load: not an Error object/)).toBeInTheDocument();
    errSpy.mockRestore();
    vi.doUnmock("prosemirror-view");
    vi.resetModules();
  });
});

describe("SAMPLE import sanity (shared fixture used by other assertions above)", () => {
  it("is imported and non-empty", () => {
    expect(SAMPLE.length).toBeGreaterThan(0);
  });
});
