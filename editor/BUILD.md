# Offline build of the proofing editor

`index.html` loads ProseMirror from a CDN (esm.sh) at runtime, so it needs the internet
the first time and won't run behind a strict network. `index_local.html` + `bundle.js`
are a **self-contained, offline** build of the same editor — identical UI and behaviour,
no CDN, no import map.

Serve either the same way:

```bash
python3 -m http.server 8080     # then open http://localhost:8080/index_local.html
```

## Rebuilding `bundle.js`

`bundle.js` is `index.html`'s inline module (`app.js`), bundled with its dependencies
pinned to the same versions as the import map. esbuild deduplicates the shared
ProseMirror packages — bundling them separately would create duplicate module instances
and break the editor.

```bash
npm install \
  prosemirror-model@1.21.0 prosemirror-transform@1.9.0 prosemirror-state@1.4.3 \
  prosemirror-view@1.33.4 prosemirror-keymap@1.2.2 prosemirror-commands@1.6.0 \
  prosemirror-history@1.4.1 prosemirror-schema-basic@1.2.3 prosemirror-schema-list@1.4.1 \
  prosemirror-markdown@1.13.1 markdown-it@14.1.0 orderedmap@2.1.1 w3c-keyname@2.2.8 esbuild

npx esbuild app.js --bundle --format=esm --outfile=bundle.js
```

`app.js` is the `<script type="module">` extracted verbatim from `index.html`, and
`index_local.html` is `index.html` with the `<script type="importmap">` removed and the
inline module replaced by `<script type="module" src="bundle.js"></script>`.

The CDN `index.html` stays the canonical source; regenerate `bundle.js` whenever the
editor logic or a pinned version changes.
