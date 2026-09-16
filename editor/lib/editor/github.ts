/**
 * github.ts
 *
 * Usage scope: The CLQ Proofing Editor's GitHub contents-API persistence helpers — imported by
 * the (forthcoming) React component that wires up the "load from GitHub" / "save to GitHub" UI
 * for proofing an `openlaw-au/cla-clq` article.
 *
 * Purpose: Typed, behaviour-preserving port of the GitHub load/save helpers previously inlined
 * (and DOM-coupled, reading `$ghRepo`/`$ghPath`/`$ghBranch`/`$ghToken` input elements directly)
 * in the legacy `editor/app.js` (lines 287-377). Here every helper is a PURE function: DOM/form
 * reads are replaced by a plain `{repo, path, branch, token}` input object, and network calls take
 * an injectable `fetchFn` (defaulting to `globalThis.fetch`) so callers — and tests — never need a
 * real DOM or a real network. Exports:
 *   - `b64encodeUtf8` / `b64decodeUtf8`: UTF-8-safe base64 codec (GitHub's contents API transports
 *     file bodies as base64 of the raw UTF-8 bytes, not of the JS UTF-16 string).
 *   - `parseGhParts`: validates and normalizes the four form fields into a `GhParts`.
 *   - `ghUrl`: builds a GitHub contents-API URL for a repo-relative path.
 *   - `ghHeaders`: builds the GitHub API request headers, adding `Authorization` only when a token
 *     is present (unauthenticated reads of public repos work without one).
 *   - `ghErr`: turns a non-ok `Response` into an `Error` carrying GitHub's own message when the
 *     body is JSON with a `message` field, falling back to `r.statusText` otherwise.
 *   - `loadFile` / `saveFile`: the GET/PUT round trips against the contents API.
 *
 * Protocol: keep this module in lockstep with the legacy `editor/app.js` (lines 287-377) — same
 * URL shape, same header set, same commit message format (`"Proof: " + path + " (CLQ editor)"`),
 * same trailing-newline-on-save behaviour, and same sha-present-means-update /
 * sha-absent-means-create logic — until that file is removed; any divergence changes what gets
 * written to the upstream repo. The GitHub personal access token is never persisted by this
 * module (no localStorage/sessionStorage access here) — it lives only in the caller's in-memory
 * state for the lifetime of one request; the React component is responsible for persisting
 * repo/path/branch (never the token) the way the legacy `rememberGh()` did.
 */

/** Parsed, validated GitHub contents-API location plus optional auth token. */
export interface GhParts {
  /** Repo owner, e.g. "openlaw-au". */
  owner: string;
  /** Repo name, e.g. "cla-clq". */
  name: string;
  /** Repo-relative file path, leading slashes stripped. */
  path: string;
  /** Branch or ref name; defaults to "main" when not supplied. */
  branch: string;
  /** Personal access token with repo write scope, if provided. Empty string if none. */
  token: string;
}

/** Raw form-field values accepted by {@link parseGhParts}, as typed by the editor's GitHub panel. */
export interface GhPartsInput {
  /** Repo, accepted as `owner/name` or a full `https://github.com/owner/name(.git)` URL. */
  repo: string;
  /** Repo-relative file path, optionally with leading slashes. */
  path: string;
  /** Branch or ref name; blank means "main". */
  branch: string;
  /** Personal access token with repo write scope; blank means unauthenticated. */
  token: string;
}

/**
 * UTF-8-safe base64 encode: encodes `str` to its UTF-8 bytes, then base64s those bytes (not the
 * UTF-16 code units `btoa` would otherwise choke on for non-Latin1 input).
 */
export function b64encodeUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/**
 * UTF-8-safe base64 decode, the inverse of {@link b64encodeUtf8}. Strips whitespace first since
 * GitHub's contents API returns `content` as base64 wrapped at 60 characters with embedded
 * newlines.
 */
export function b64decodeUtf8(b64: string): string {
  const bin = atob((b64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Validates and normalizes the GitHub panel's raw form fields into a {@link GhParts}. Pure
 * counterpart to the legacy `ghParts()`, which read the same four values off DOM inputs.
 *
 * Throws `Error("Repository must be owner/name, e.g. openlaw-au/cla-clq.")` when the repo field
 * (after stripping an optional `https://github.com/` prefix and `.git` suffix) doesn't split into
 * a non-empty `owner` and `name`. Throws `Error("Enter the file path within the repo.")` when the
 * path field is empty after stripping leading slashes.
 */
export function parseGhParts(input: GhPartsInput): GhParts {
  const repo = input.repo
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  const [owner, name] = repo.split("/");
  const path = input.path.trim().replace(/^\/+/, "");
  const branch = input.branch.trim() || "main";
  const token = input.token.trim();
  if (!owner || !name) {
    throw new Error("Repository must be owner/name, e.g. openlaw-au/cla-clq.");
  }
  if (!path) {
    throw new Error("Enter the file path within the repo.");
  }
  return { owner, name, path, branch, token };
}

/**
 * Builds a GitHub contents-API URL for `path` within `owner/name`, percent-encoding each
 * path segment individually (so a literal `/` in a segment can't be mistaken for a path
 * separator, while the segment boundaries themselves stay intact).
 */
export function ghUrl(owner: string, name: string, path: string): string {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${name}/contents/${enc}`;
}

/**
 * Builds the standard GitHub REST API headers, adding `Authorization: Bearer <token>` only when
 * `token` is a non-empty string — unauthenticated requests are valid for reading public repos.
 */
export function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h["Authorization"] = "Bearer " + token;
  return h;
}

/**
 * Builds an `Error` for a non-ok GitHub API `Response`, preferring the API's own JSON
 * `message` field and falling back to `r.statusText` when the body isn't JSON (or has no
 * `message`).
 */
export async function ghErr(r: Response): Promise<Error> {
  let m = r.statusText;
  try {
    const j = (await r.json()) as { message?: string };
    m = j.message || m;
  } catch {
    /* body wasn't JSON — keep statusText */
  }
  return new Error(`GitHub ${r.status}: ${m}`);
}

/** Result of a successful {@link loadFile} call. */
export interface LoadFileResult {
  /** Decoded (UTF-8) file content. */
  content: string;
  /** The blob sha GitHub reports for this file, needed to update it via {@link saveFile}. */
  sha: string;
}

/**
 * Loads a file's content from the GitHub contents API at `parts.branch`. Throws (via
 * {@link ghErr}) when the response isn't ok.
 */
export async function loadFile(
  parts: GhParts,
  fetchFn: typeof fetch = fetch,
): Promise<LoadFileResult> {
  const r = await fetchFn(
    ghUrl(parts.owner, parts.name, parts.path) + "?ref=" + encodeURIComponent(parts.branch),
    { headers: ghHeaders(parts.token) },
  );
  if (!r.ok) throw await ghErr(r);
  const j = (await r.json()) as { content: string; sha: string };
  return { content: b64decodeUtf8(j.content), sha: j.sha };
}

/** Result of a successful {@link saveFile} call. */
export interface SaveFileResult {
  /** The new blob sha of the saved file, if GitHub reported one. */
  sha: string | undefined;
  /** The sha of the commit GitHub created for this save, if reported. */
  commit: string | undefined;
}

/**
 * Saves `content` to the GitHub contents API at `parts.branch`, creating the commit message
 * `"Proof: " + parts.path + " (CLQ editor)"`. A trailing newline is appended to `content` before
 * encoding, matching the legacy save behaviour. When `sha` is provided the request updates the
 * existing blob (GitHub requires the current sha for updates); when omitted, GitHub creates a new
 * file. Throws (via {@link ghErr}) when the response isn't ok.
 */
export async function saveFile(
  parts: GhParts,
  content: string,
  sha: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<SaveFileResult> {
  const body: { message: string; content: string; branch: string; sha?: string } = {
    message: "Proof: " + parts.path + " (CLQ editor)",
    content: b64encodeUtf8(content + "\n"),
    branch: parts.branch,
  };
  if (sha) body.sha = sha; // update; omit to create
  const r = await fetchFn(ghUrl(parts.owner, parts.name, parts.path), {
    method: "PUT",
    headers: { ...ghHeaders(parts.token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await ghErr(r);
  const j = (await r.json()) as { content?: { sha?: string }; commit?: { sha?: string } };
  return { sha: j.content && j.content.sha, commit: j.commit && j.commit.sha };
}
