/**
 * github.test.ts
 *
 * Usage scope: Vitest unit tests for `lib/editor/github.ts`.
 *
 * Purpose: Behaviour-preserving verification that the typed GitHub contents-API helpers match the
 * legacy `editor/app.js` (lines 287-377) exactly: the UTF-8 base64 codec round-trip, `parseGhParts`
 * validation/normalization (including both throw messages), URL percent-encoding, conditional
 * Authorization header, `ghErr`'s JSON-message-vs-statusText fallback, and `loadFile`/`saveFile`'s
 * request shape (method, URL, headers, body) and response mapping — using fake `fetchFn` objects so
 * no test ever touches the network.
 *
 * Protocol: covers every branch in github.ts to satisfy the repo's 100% line+branch coverage gate
 * (see `CLAUDE.md`). Fake `Response`-like objects are plain objects with `ok`/`status`/
 * `statusText`/`json()`, matching the subset of the `Response` interface the module actually uses.
 */
import { describe, expect, it, vi } from "vitest";
import {
  b64decodeUtf8,
  b64encodeUtf8,
  ghErr,
  ghHeaders,
  ghUrl,
  loadFile,
  parseGhParts,
  saveFile,
} from "./github";

/** Minimal fake of the `Response` surface this module reads. */
interface FakeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}

function fakeOkResponse(body: unknown): FakeResponse {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

function fakeErrResponse(status: number, statusText: string, body: unknown): FakeResponse {
  return { ok: false, status, statusText, json: async () => body };
}

describe("b64encodeUtf8 / b64decodeUtf8", () => {
  it("round-trips plain ASCII", () => {
    const s = "hello world";
    expect(b64decodeUtf8(b64encodeUtf8(s))).toBe(s);
  });

  it("round-trips UTF-8 (curly quote, em-dash, non-ASCII)", () => {
    const s = "It’s a test — café 中文";
    expect(b64decodeUtf8(b64encodeUtf8(s))).toBe(s);
  });

  it("decode strips embedded whitespace/newlines from the base64 input", () => {
    const s = "hello world, this is a longer string to base64 encode";
    const encoded = b64encodeUtf8(s);
    const wrapped = encoded.match(/.{1,10}/g)!.join("\n ");
    expect(b64decodeUtf8(wrapped)).toBe(s);
  });

  it("decode defaults falsy input to empty string before stripping", () => {
    expect(b64decodeUtf8("")).toBe("");
  });
});

describe("parseGhParts", () => {
  it("strips the https://github.com/ prefix and .git suffix, splits owner/name", () => {
    const p = parseGhParts({
      repo: "https://github.com/openlaw-au/cla-clq.git",
      path: "articles/foo.md",
      branch: "",
      token: "",
    });
    expect(p.owner).toBe("openlaw-au");
    expect(p.name).toBe("cla-clq");
  });

  it("accepts a bare owner/name repo", () => {
    const p = parseGhParts({ repo: "openlaw-au/cla-clq", path: "a.md", branch: "", token: "" });
    expect(p.owner).toBe("openlaw-au");
    expect(p.name).toBe("cla-clq");
  });

  it("strips leading slashes from the path", () => {
    const p = parseGhParts({
      repo: "openlaw-au/cla-clq",
      path: "///articles/foo.md",
      branch: "main",
      token: "",
    });
    expect(p.path).toBe("articles/foo.md");
  });

  it("defaults branch to main when blank", () => {
    const p = parseGhParts({ repo: "openlaw-au/cla-clq", path: "a.md", branch: "  ", token: "" });
    expect(p.branch).toBe("main");
  });

  it("preserves an explicit branch", () => {
    const p = parseGhParts({
      repo: "openlaw-au/cla-clq",
      path: "a.md",
      branch: "release/v2",
      token: "",
    });
    expect(p.branch).toBe("release/v2");
  });

  it("passes the token through, trimmed", () => {
    const p = parseGhParts({
      repo: "openlaw-au/cla-clq",
      path: "a.md",
      branch: "main",
      token: "  ghp_abc123  ",
    });
    expect(p.token).toBe("ghp_abc123");
  });

  it("throws the exact message when repo has no slash", () => {
    expect(() => parseGhParts({ repo: "not-a-repo", path: "a.md", branch: "", token: "" })).toThrow(
      "Repository must be owner/name, e.g. openlaw-au/cla-clq.",
    );
  });

  it("throws the exact message when repo is empty", () => {
    expect(() => parseGhParts({ repo: "", path: "a.md", branch: "", token: "" })).toThrow(
      "Repository must be owner/name, e.g. openlaw-au/cla-clq.",
    );
  });

  it("throws the exact message when path is empty", () => {
    expect(() =>
      parseGhParts({ repo: "openlaw-au/cla-clq", path: "   ", branch: "", token: "" }),
    ).toThrow("Enter the file path within the repo.");
  });

  it("throws the exact message when path is only leading slashes", () => {
    expect(() =>
      parseGhParts({ repo: "openlaw-au/cla-clq", path: "///", branch: "", token: "" }),
    ).toThrow("Enter the file path within the repo.");
  });
});

describe("ghUrl", () => {
  it("builds the contents-API URL for a simple path", () => {
    expect(ghUrl("openlaw-au", "cla-clq", "articles/foo.md")).toBe(
      "https://api.github.com/repos/openlaw-au/cla-clq/contents/articles/foo.md",
    );
  });

  it("percent-encodes each path segment (space, special chars)", () => {
    expect(ghUrl("openlaw-au", "cla-clq", "articles/my file (v2).md")).toBe(
      "https://api.github.com/repos/openlaw-au/cla-clq/contents/articles/my%20file%20(v2).md",
    );
  });
});

describe("ghHeaders", () => {
  it("omits Authorization when no token is given", () => {
    expect(ghHeaders()).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  });

  it("omits Authorization when token is an empty string", () => {
    expect(ghHeaders("")).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  });

  it("includes Authorization: Bearer <token> when a token is given", () => {
    expect(ghHeaders("ghp_abc123")).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer ghp_abc123",
    });
  });
});

describe("ghErr", () => {
  it("uses the JSON body's message when present", async () => {
    const r = fakeErrResponse(404, "Not Found", { message: "Not Found in repo" });
    const err = await ghErr(r as unknown as Response);
    expect(err.message).toBe("GitHub 404: Not Found in repo");
  });

  it("falls back to statusText when the JSON body has no message", async () => {
    const r = fakeErrResponse(500, "Server Error", {});
    const err = await ghErr(r as unknown as Response);
    expect(err.message).toBe("GitHub 500: Server Error");
  });

  it("falls back to statusText when .json() rejects (non-JSON body)", async () => {
    const r: FakeResponse = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => {
        throw new Error("not json");
      },
    };
    const err = await ghErr(r as unknown as Response);
    expect(err.message).toBe("GitHub 503: Service Unavailable");
  });
});

describe("loadFile", () => {
  const parts = { owner: "openlaw-au", name: "cla-clq", path: "a.md", branch: "main", token: "" };

  it("returns decoded content + sha on success, and calls the expected URL/headers", async () => {
    const content = b64encodeUtf8("hello — world");
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content, sha: "abc123" }),
    );
    const result = await loadFile(parts, fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ content: "hello — world", sha: "abc123" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/openlaw-au/cla-clq/contents/a.md?ref=main");
    expect(init).toEqual({
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
  });

  it("includes Authorization header when a token is set", async () => {
    const withToken = { ...parts, token: "ghp_xyz" };
    const content = b64encodeUtf8("x");
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content, sha: "s" }),
    );
    await loadFile(withToken, fetchFn as unknown as typeof fetch);
    const [, init] = fetchFn.mock.calls[0];
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer ghp_xyz",
    );
  });

  it("URL-encodes the branch in ?ref=", async () => {
    const branchParts = { ...parts, branch: "feature/x y" };
    const content = b64encodeUtf8("x");
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content, sha: "s" }),
    );
    await loadFile(branchParts, fetchFn as unknown as typeof fetch);
    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain("?ref=feature%2Fx%20y");
  });

  it("throws via ghErr on a non-ok response", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeErrResponse(404, "Not Found", { message: "Not Found" }),
    );
    await expect(loadFile(parts, fetchFn as unknown as typeof fetch)).rejects.toThrow(
      "GitHub 404: Not Found",
    );
  });

  it("defaults fetchFn to the global fetch when not supplied", async () => {
    const content = b64encodeUtf8("x");
    const stub = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content, sha: "s" }),
    );
    const original = globalThis.fetch;
    globalThis.fetch = stub as unknown as typeof fetch;
    try {
      const result = await loadFile(parts);
      expect(result).toEqual({ content: "x", sha: "s" });
      expect(stub).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("saveFile", () => {
  const parts = {
    owner: "openlaw-au",
    name: "cla-clq",
    path: "articles/a.md",
    branch: "main",
    token: "ghp_abc",
  };

  it("PUTs with sha in the body when updating, and returns sha/commit", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content: { sha: "newsha" }, commit: { sha: "commitsha" } }),
    );
    const result = await saveFile(
      parts,
      "hello world",
      "oldsha",
      fetchFn as unknown as typeof fetch,
    );
    expect(result).toEqual({ sha: "newsha", commit: "commitsha" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/openlaw-au/cla-clq/contents/articles/a.md");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_abc");
    const body = JSON.parse(init.body as string);
    expect(body.message).toBe("Proof: articles/a.md (CLQ editor)");
    expect(body.branch).toBe("main");
    expect(body.sha).toBe("oldsha");
    expect(b64decodeUtf8(body.content)).toBe("hello world\n");
  });

  it("omits sha from the body when creating (sha undefined)", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content: { sha: "s1" }, commit: { sha: "c1" } }),
    );
    await saveFile(parts, "new file", undefined, fetchFn as unknown as typeof fetch);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.sha).toBeUndefined();
    expect("sha" in body).toBe(false);
  });

  it("returns undefined sha/commit when the response omits them", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => fakeOkResponse({}));
    const result = await saveFile(parts, "x", undefined, fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ sha: undefined, commit: undefined });
  });

  it("throws via ghErr on a non-ok response", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeErrResponse(422, "Unprocessable Entity", { message: "sha does not match" }),
    );
    await expect(
      saveFile(parts, "x", "staleSha", fetchFn as unknown as typeof fetch),
    ).rejects.toThrow("GitHub 422: sha does not match");
  });

  it("defaults fetchFn to the global fetch when not supplied", async () => {
    const stub = vi.fn(async (_url: string, _init?: RequestInit) =>
      fakeOkResponse({ content: { sha: "s" }, commit: { sha: "c" } }),
    );
    const original = globalThis.fetch;
    globalThis.fetch = stub as unknown as typeof fetch;
    try {
      const result = await saveFile(parts, "x", undefined);
      expect(result).toEqual({ sha: "s", commit: "c" });
      expect(stub).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
