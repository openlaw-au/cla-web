# Offline build of the proofing editor

The editor is one ES module, `app.js`. Two HTML shells load it:

- **`index.html`** — the CDN build. An `importmap` resolves the bare ProseMirror imports to
  esm.sh, and `<script type="module" src="app.js">` runs the module. Needs the internet the
  first time.
- **`index_local.html` + `bundle.js`** — a self-contained **offline** build (identical UI and
  behaviour, no CDN, no import map). `index_local.html` is `index.html` with the
  `<script type="importmap">` removed and `app.js` swapped for `bundle.js`.

`app.js` is the single source of truth. (Earlier versions kept a copy of the module inline in
`index.html`; it now references `app.js` directly so there is nothing to keep in sync.)

Serve either shell over http — ES-module scripts do not run from `file://`:

```bash
python3 -m http.server 8080     # http://localhost:8080/ or /index_local.html
```

## Rebuilding `bundle.js`

Bundle `app.js` with its dependencies pinned to the same versions as the import map. esbuild
deduplicates the shared ProseMirror packages — bundling them separately would create
duplicate module instances and break the editor.

```bash
npm install \
  prosemirror-model@1.21.0 prosemirror-transform@1.9.0 prosemirror-state@1.4.3 \
  prosemirror-view@1.33.4 prosemirror-keymap@1.2.2 prosemirror-commands@1.6.0 \
  prosemirror-history@1.4.1 prosemirror-schema-basic@1.2.3 prosemirror-schema-list@1.4.1 \
  prosemirror-markdown@1.13.1 markdown-it@14.1.0 orderedmap@2.1.1 w3c-keyname@2.2.8 esbuild

npx esbuild app.js --bundle --format=esm --outfile=bundle.js
```

Regenerate `index_local.html` if the head/markup of `index.html` changed:

```bash
python3 - <<'PY'
import re
h = open("index.html").read()
h = re.sub(r'<script type="importmap">.*?</script>\s*', '', h, flags=re.S)
h = h.replace('src="app.js"', 'src="bundle.js"')
open("index_local.html","w").write(h)
PY
```

Regenerate `bundle.js` whenever `app.js` or a pinned version changes; the CDN `index.html`
stays the canonical shell.
