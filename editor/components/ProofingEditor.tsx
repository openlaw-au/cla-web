"use client";

/**
 * components/ProofingEditor.tsx
 *
 * Usage scope: The CLQ Proofing Editor's top-level UI — rendered by `app/page.tsx` at the app's
 * root route ("/"). This is the client-side assembly point for every module ported from the
 * legacy `editor/app.js`: the schema (`lib/editor/schema.ts`), markdown round trip
 * (`lib/editor/markdown.ts`, `lib/editor/preprocess.ts`), commands/toolbar/keymap
 * (`lib/editor/commands.ts`), the footnote node view (`lib/editor/footnote-view.ts`), the
 * numbering plugin (`lib/editor/numbering.ts`), the sample document (`lib/editor/sample.ts`),
 * and GitHub persistence (`lib/editor/github.ts`).
 *
 * Purpose: Mounts a ProseMirror `EditorView` into a ref'd div on first render, seeded from
 * {@link SAMPLE} parsed via {@link parseMarkdown}, with `history()` + the CLQ keymap + the base
 * keymap + {@link numberingPlugin} as plugins and a `footnote` node view that owns selection
 * state via {@link FootnoteView}'s `onSelect`/`onDeselect` callbacks (see that module's header
 * for why this replaces the legacy module-level `selectedFnPos` global). React state — not
 * ProseMirror state — owns everything the surrounding UI needs to read or drive: the toolbar
 * (rendered from {@link toolbarSpec}), the "Selected footnote" textarea, the Markdown in/out
 * panel (Load/Export/Download), and the GitHub load/save panel (persisting repo/path/branch,
 * never the token, to `localStorage` under `"clq-editor-gh"`).
 *
 * Protocol: this is a `'use client'` component — it touches ProseMirror's DOM-based `EditorView`,
 * `localStorage`, and `fetch`, none of which exist during server rendering. The `EditorView`
 * itself is intentionally NOT React-managed (no re-render ever recreates or diff-patches it);
 * React state changes that need to reach the document (footnote-text edits, Markdown Load) go
 * through `view.dispatch(...)` imperatively, the same one-way-out-only relationship the legacy
 * `app.js` had between its DOM listeners and the module-level `view`. The `EditorView` is
 * destroyed on unmount (the `useEffect` mount effect's cleanup) to avoid leaking DOM listeners.
 * Keep the toolbar labels/order, footnote textarea behaviour, Markdown in/out behaviour, and
 * GitHub panel behaviour (including the exact status/error message text) in lockstep with the
 * legacy `editor/app.js` (lines 237-377) until that file is removed. Do not modify
 * `editor/app.js` or the done `lib/editor/{schema,preprocess,markdown,commands,github}.ts`.
 */
import { useEffect, useRef, useState } from "react";
import { EditorState, type Command } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { clqKeymap, toolbarSpec } from "../lib/editor/commands";
import { FootnoteView } from "../lib/editor/footnote-view";
import {
  type GhParts,
  type GhPartsInput,
  loadFile,
  parseGhParts,
  saveFile,
} from "../lib/editor/github";
import { parseMarkdown, serializeDoc } from "../lib/editor/markdown";
import { numberingPlugin } from "../lib/editor/numbering";
import { SAMPLE } from "../lib/editor/sample";

/**
 * Extracts a human-readable message from a caught value of unknown shape: `err.message` when
 * `err` is an `Error`, else its string coercion. Centralizes the `catch (err) { ... }` idiom
 * repeated across this component's error-reporting paths (editor mount, Markdown load, and both
 * GitHub load/save handlers) so they report failures identically.
 */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `localStorage` key the GitHub panel persists `{repo, path, branch}` under (never the token). */
const GH_STORAGE_KEY = "clq-editor-gh";

/** Shape persisted to {@link GH_STORAGE_KEY}. */
interface StoredGhFields {
  repo?: string;
  path?: string;
  branch?: string;
}

/**
 * Reads and validates the persisted GitHub fields from `localStorage`, tolerating a missing/
 * unparsable value and the private-mode/blocked-storage case where `localStorage` access itself
 * throws (mirrors the legacy `try{...}catch(e){}` around `rememberGh`'s counterpart in
 * `editor/app.js` lines 296-301).
 */
function readStoredGhFields(): StoredGhFields {
  try {
    const raw = window.localStorage.getItem(GH_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as StoredGhFields;
    return {};
  } catch {
    return {};
  }
}

/**
 * Persists `{repo, path, branch}` (never the token) to `localStorage`, tolerating a throw from
 * blocked storage (private browsing, etc.) the same way the legacy `rememberGh()` did.
 */
function writeStoredGhFields(fields: Required<StoredGhFields>): void {
  try {
    window.localStorage.setItem(GH_STORAGE_KEY, JSON.stringify(fields));
  } catch {
    /* private mode / blocked storage — ignore, matching editor/app.js's rememberGh() */
  }
}

/** Builds the initial editor `EditorState`, seeded from {@link SAMPLE}. */
function createInitialState(): EditorState {
  const doc = parseMarkdown(SAMPLE);
  return EditorState.create({
    doc,
    plugins: [history(), keymap(clqKeymap), keymap(baseKeymap), numberingPlugin],
  });
}

/**
 * The CLQ Proofing Editor's assembled React UI. See the file header for the full architecture;
 * this component has no props — it is a self-contained page-level assembly.
 */
export default function ProofingEditor(): React.JSX.Element {
  const editorWrapRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [status, setStatus] = useState("Loading editor…");

  const [selectedPos, setSelectedPos] = useState<number | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const [mdio, setMdio] = useState("");

  const [ghRepo, setGhRepo] = useState(() => readStoredGhFields().repo ?? "");
  const [ghPath, setGhPath] = useState(() => readStoredGhFields().path ?? "");
  const [ghBranch, setGhBranch] = useState(() => readStoredGhFields().branch ?? "");
  const [ghToken, setGhToken] = useState("");
  const [ghMsg, setGhMsg] = useState("");
  const [ghMsgCls, setGhMsgCls] = useState<"" | "ok" | "err">("");
  const ghShaRef = useRef<string | undefined>(undefined);

  // A forceUpdate counter: nothing in React state describes "what does the mounted ProseMirror
  // doc currently look like", by design (see the file header) — but the toolbar's disabled/active
  // affordances and the footnote panel both want to react to selection/doc changes inside the
  // EditorView. Re-rendering on every dispatched transaction keeps the toolbar/aside in sync
  // without lifting ProseMirror's own state into React.
  const [, setRenderTick] = useState(0);

  // Mount the EditorView once, on first render; destroy it on unmount. `editorWrapRef.current` is
  // always set by the time this effect runs — React attaches refs before running effects — so
  // this intentionally does not defensively null-check it (an untestable, unreachable branch).
  useEffect(() => {
    const container = editorWrapRef.current as HTMLDivElement;

    let view: EditorView;
    try {
      const state = createInitialState();
      view = new EditorView(container, {
        state,
        nodeViews: {
          footnote: (node, v, getPos) =>
            new FootnoteView(node, v, getPos, {
              onSelect: (pos, text) => {
                setSelectedPos(pos);
                setSelectedText(text);
              },
              onDeselect: () => {
                setSelectedPos(null);
                setSelectedText("");
              },
            }),
        },
        dispatchTransaction(tr) {
          const next = view.state.apply(tr);
          view.updateState(next);
          setRenderTick((n) => n + 1);
        },
      });
      viewRef.current = view;
      // This effect's whole job is synchronizing React with the imperatively-mounted
      // EditorView — an external system, per the rule's own carve-out — so the status message
      // reporting mount success/failure belongs here, not in a lazy initializer (the EditorView
      // can't exist before this ref'd div is in the DOM).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(
        "Ready. Edit above; select a footnote to change it; load/save a cla-clq article on the right.",
      );
    } catch (err) {
      setStatus("Editor failed to load: " + errorMessage(err) + " — see console.");
      console.error(err);
    }

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // Mount once; the view is never recreated on prop/state changes (see file header).
  }, []);

  /**
   * Returns the mounted `EditorView`. Only ever called from event handlers wired to elements
   * that render inside this same component tree — i.e. after the mount effect above has already
   * run and set `viewRef.current` — so a null view here would mean this component rendered
   * interactive children before mounting, which cannot happen; typed as non-null rather than
   * defensively guarded against an unreachable case.
   */
  function getView(): EditorView {
    return viewRef.current as EditorView;
  }

  /** Replaces the mounted document with `doc`, matching the legacy `mount()`/`loadMarkdown()`. */
  function replaceDoc(doc: ReturnType<typeof parseMarkdown>): void {
    const state = EditorState.create({
      doc,
      plugins: [history(), keymap(clqKeymap), keymap(baseKeymap), numberingPlugin],
    });
    getView().updateState(state);
    setSelectedPos(null);
    setSelectedText("");
    setRenderTick((n) => n + 1);
  }

  /** Toolbar button click handler: runs the command against the live view, then refocuses it. */
  function runToolbarCommand(run: Command): void {
    const view = getView();
    run(view.state, view.dispatch.bind(view), view);
    view.focus();
  }

  /** "Selected footnote" textarea onChange: writes the new text into the node via setNodeMarkup. */
  function handleFootnoteTextChange(text: string): void {
    setSelectedText(text);
    if (selectedPos == null) return;
    const view = getView();
    const tr = view.state.tr.setNodeMarkup(selectedPos, null, { text });
    tr.setMeta("addToHistory", true);
    view.dispatch(tr);
  }

  /** Markdown panel "Load into editor ▸": parses `mdio` and replaces the document. */
  function handleLoad(): void {
    const src = mdio.trim();
    if (!src) {
      setStatus("Paste some Markdown first.");
      return;
    }
    try {
      replaceDoc(parseMarkdown(src));
      setStatus("Loaded.");
    } catch (err) {
      setStatus("Parse error: " + errorMessage(err));
      console.error(err);
    }
  }

  /** Markdown panel "◂ Export Markdown": serializes the current document into `mdio`. */
  function handleExport(): void {
    setMdio(serializeDoc(getView().state.doc));
    setStatus("Exported Markdown.");
  }

  /** Markdown panel "Download .md": triggers a browser download of the serialized document. */
  function handleDownload(): void {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([serializeDoc(getView().state.doc)], { type: "text/markdown" }),
    );
    a.download = "article.md";
    a.click();
  }

  /** Persists the GitHub repo/path/branch fields (never the token). */
  function rememberGh(): void {
    writeStoredGhFields({ repo: ghRepo.trim(), path: ghPath.trim(), branch: ghBranch.trim() });
  }

  /** Sets the GitHub panel's status message and its ok/err styling class. */
  function showGhMsg(text: string, cls: "" | "ok" | "err"): void {
    setGhMsg(text);
    setGhMsgCls(cls);
  }

  /**
   * Reports a caught GitHub load/save failure: surfaces {@link errorMessage} in the GitHub
   * panel's error styling and logs the original error for debugging. Shared by {@link
   * handleGhLoad} and {@link handleGhSave}'s catch blocks, which handle a failed request
   * identically.
   */
  function reportGhError(err: unknown): void {
    showGhMsg(errorMessage(err), "err");
    console.error(err);
  }

  /** Resolves the current GitHub form fields via `parseGhParts`, surfacing validation errors. */
  function parseCurrentGhParts(): GhParts | null {
    const input: GhPartsInput = { repo: ghRepo, path: ghPath, branch: ghBranch, token: ghToken };
    try {
      return parseGhParts(input);
    } catch (err) {
      showGhMsg(errorMessage(err), "err");
      return null;
    }
  }

  /** GitHub panel "Load from GitHub ▸". */
  async function handleGhLoad(): Promise<void> {
    const parts = parseCurrentGhParts();
    if (!parts) return;
    showGhMsg("Loading " + parts.path + " …", "");
    try {
      const result = await loadFile(parts);
      ghShaRef.current = result.sha;
      replaceDoc(parseMarkdown(result.content));
      rememberGh();
      showGhMsg("Loaded " + parts.path + " @ " + (result.sha || "").slice(0, 7) + ".", "ok");
      setStatus("Loaded " + parts.path + " from " + parts.owner + "/" + parts.name + ".");
    } catch (err) {
      reportGhError(err);
    }
  }

  /** GitHub panel "◂ Save to GitHub". */
  async function handleGhSave(): Promise<void> {
    const parts = parseCurrentGhParts();
    if (!parts) return;
    if (!parts.token) {
      showGhMsg("A token with repo write scope is required to save.", "err");
      return;
    }
    showGhMsg("Saving " + parts.path + " …", "");
    try {
      const result = await saveFile(parts, serializeDoc(getView().state.doc), ghShaRef.current);
      ghShaRef.current = result.sha;
      rememberGh();
      showGhMsg("Saved — commit " + (result.commit || "").slice(0, 7) + ".", "ok");
      setStatus(
        "Saved " +
          parts.path +
          " to " +
          parts.owner +
          "/" +
          parts.name +
          " (" +
          parts.branch +
          ").",
      );
    } catch (err) {
      reportGhError(err);
    }
  }

  return (
    <>
      <header>
        <h1>CLQ Proofing Editor</h1>
        <span className="muted">
          Round-trips Markdown (headings · italics · bold · small caps · quotes · lists ·
          footnotes). Loads &amp; saves to cla-clq. Press build stays in CI.
        </span>
      </header>

      <div className="toolbar">
        {toolbarSpec.map((item, i) =>
          item.type === "sep" ? (
            <span className="sep" key={`sep-${i}`} />
          ) : (
            <button
              key={item.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                runToolbarCommand(item.run);
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>

      <main className="editor-main">
        <div id="editorWrap">
          <div ref={editorWrapRef} />
        </div>
        <aside>
          <h2>Selected footnote</h2>
          <textarea
            value={selectedText}
            disabled={selectedPos == null}
            onChange={(e) => handleFootnoteTextChange(e.target.value)}
            placeholder="Select a footnote (the superscript) to edit its text here. Markdown allowed — e.g. *Case v Name* (2025) 1 CLR 1. Leave a blank line for a multi-paragraph note (shown amber)."
          />
          <div className="hint">
            One paragraph exports as an inline note <code>^[…]</code>; a note with a blank line
            exports as a numbered reference note <code>[^n]</code> with an indented block. Both
            become <code>{"\\footnote{…}"}</code> in the pipeline.
          </div>

          <div className="gh">
            <h2>GitHub — cla-clq article</h2>
            <label htmlFor="ghRepo">Repository (owner/name)</label>
            <input
              id="ghRepo"
              placeholder="openlaw-au/cla-clq"
              spellCheck={false}
              value={ghRepo}
              onChange={(e) => setGhRepo(e.target.value)}
            />
            <label htmlFor="ghPath">File path</label>
            <input
              id="ghPath"
              placeholder="issues/2026-Vol40-No3/src/peden_body.tex"
              spellCheck={false}
              value={ghPath}
              onChange={(e) => setGhPath(e.target.value)}
            />
            <label htmlFor="ghBranch">Branch</label>
            <input
              id="ghBranch"
              placeholder="main"
              spellCheck={false}
              value={ghBranch}
              onChange={(e) => setGhBranch(e.target.value)}
            />
            <label htmlFor="ghToken">Token (repo scope — kept in memory only)</label>
            <input
              id="ghToken"
              type="password"
              placeholder="github_pat_… / ghp_…"
              spellCheck={false}
              autoComplete="off"
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
            />
            <div className="row">
              <button type="button" onClick={() => void handleGhLoad()}>
                Load from GitHub ▸
              </button>
              <button type="button" className="primary" onClick={() => void handleGhSave()}>
                ◂ Save to GitHub
              </button>
            </div>
            <div className={"ghmsg" + (ghMsgCls ? " " + ghMsgCls : "")}>{ghMsg}</div>
          </div>

          <div className="io">
            <h2>Markdown in / out</h2>
            <textarea
              value={mdio}
              onChange={(e) => setMdio(e.target.value)}
              placeholder="Or paste an article's Markdown here and press Load. Reference footnotes [^1] (incl. multi-paragraph) and inline ^[…] are both supported."
            />
            <div className="row">
              <button type="button" onClick={handleLoad}>
                Load into editor ▸
              </button>
              <button type="button" className="primary" onClick={handleExport}>
                ◂ Export Markdown
              </button>
            </div>
            <div className="row">
              <button type="button" onClick={handleDownload}>
                Download .md
              </button>
            </div>
          </div>
        </aside>
      </main>

      <div className="status">{status}</div>
    </>
  );
}
