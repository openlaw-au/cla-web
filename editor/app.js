import {Schema} from "prosemirror-model";
import {EditorState, NodeSelection, Plugin} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {schema as basic} from "prosemirror-schema-basic";
import {addListNodes, wrapInList, splitListItem, liftListItem, sinkListItem} from "prosemirror-schema-list";
import {MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer} from "prosemirror-markdown";
import MarkdownIt from "markdown-it";
import {history, undo, redo} from "prosemirror-history";
import {keymap} from "prosemirror-keymap";
import {baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, createParagraphNear, liftEmptyBlock, splitBlock} from "prosemirror-commands";

const $status = document.getElementById("status");
const setStatus = m => { $status.textContent = m; };
const PARA = "\u2029";   // private separator: multi-paragraph footnote text on one source line

/* ---------- schema: basic + lists + small-caps mark + a footnote inline node ---------- */
const marks = basic.spec.marks.addToEnd("smallcaps", {
  parseDOM:[{tag:"span.clq-sc"}, {style:"font-variant", getAttrs:v => /small-caps/.test(v) && null}],
  toDOM(){ return ["span", {class:"clq-sc"}, 0]; }
});
const nodes = addListNodes(basic.spec.nodes, "paragraph block*", "block")
  .addToEnd("footnote", {
    inline:true, group:"inline", atom:true, selectable:true, draggable:false,
    attrs:{ text:{default:""} },
    toDOM(node){ return ["sup", {class:"clq-fn", title:node.attrs.text}, "fn"]; },
    parseDOM:[{ tag:"sup.clq-fn", getAttrs:d=>({text:d.getAttribute("title")||""}) }]
  });
const schema = new Schema({ nodes, marks });

/* ---------- markdown-it: inline ^[…] footnotes + [text]{.smallcaps} small caps ---------- */
const md = MarkdownIt("commonmark", {html:false});
// inline footnote  ^[ ... ]  (brackets may nest; content may carry the PARA separator)
md.inline.ruler.before("emphasis", "clq_footnote", (state, silent) => {
  const src = state.src, start = state.pos;
  if (src.charCodeAt(start) !== 0x5E /*^*/ || src.charCodeAt(start+1) !== 0x5B /*[*/) return false;
  let level = 1, pos = start + 2;
  while (pos < state.posMax) {
    const c = src.charCodeAt(pos);
    if (c === 0x5B) level++;
    else if (c === 0x5D) { level--; if (level === 0) break; }
    pos++;
  }
  if (level !== 0) return false;
  if (!silent) { const t = state.push("footnote", "", 0); t.content = src.slice(start+2, pos); }
  state.pos = pos + 1; return true;
});
// small caps  [ ... ]{.smallcaps}   (pandoc's native small-caps span; content kept plain)
md.inline.ruler.before("link", "clq_smallcaps", (state, silent) => {
  const src = state.src, start = state.pos;
  if (src.charCodeAt(start) !== 0x5B /*[*/) return false;
  let depth = 1, pos = start + 1;
  while (pos < state.posMax) {
    const c = src.charCodeAt(pos);
    if (c === 0x5B) depth++;
    else if (c === 0x5D) { depth--; if (depth === 0) break; }
    pos++;
  }
  if (depth !== 0) return false;
  const tail = "]{.smallcaps}";
  if (src.slice(pos, pos + tail.length) !== tail) return false;
  const inner = src.slice(start + 1, pos);
  if (!silent) {
    state.push("smallcaps_open", "span", 1);
    const t = state.push("text", "", 0); t.content = inner;
    state.push("smallcaps_close", "span", -1);
  }
  state.pos = pos + tail.length; return true;
});

const parser = new MarkdownParser(schema, md, {
  blockquote:{block:"blockquote"},
  paragraph:{block:"paragraph"},
  list_item:{block:"list_item"},
  bullet_list:{block:"bullet_list"},
  ordered_list:{block:"ordered_list", getAttrs:t=>({order:+t.attrGet("start")||1})},
  heading:{block:"heading", getAttrs:t=>({level:+t.tag.slice(1)})},
  code_block:{block:"code_block", noCloseToken:true},
  fence:{block:"code_block", getAttrs:t=>({params:t.info||""}), noCloseToken:true},
  hr:{node:"horizontal_rule"},
  image:{node:"image", getAttrs:t=>({src:t.attrGet("src"), title:t.attrGet("title")||null, alt:(t.children[0]&&t.children[0].content)||null})},
  hardbreak:{node:"hard_break"},
  em:{mark:"em"}, strong:{mark:"strong"}, code_inline:{mark:"code", noCloseToken:true},
  smallcaps:{mark:"smallcaps"},
  link:{mark:"link", getAttrs:t=>({href:t.attrGet("href"), title:t.attrGet("title")||null})},
  footnote:{node:"footnote", getAttrs:t=>({text:(t.content||"").split(PARA).join("\n\n")})}
});

/* ---------- serialiser: small caps + inline / multi-paragraph reference footnotes ---------- */
let _fnDefs = [];   // collected multi-paragraph footnote texts for the current serialise pass
const serializer = new MarkdownSerializer(
  Object.assign({}, defaultMarkdownSerializer.nodes, {
    footnote(state, node){
      const t = (node.attrs.text || "").trim();
      if (/\n\s*\n/.test(t)) {                         // multi-paragraph → numbered reference note
        _fnDefs.push(t);
        state.text("[^" + _fnDefs.length + "]", false);
      } else {                                          // single paragraph → inline note
        state.text("^[" + t.replace(/\s*\n\s*/g, " ") + "]", false);
      }
    }
  }),
  Object.assign({}, defaultMarkdownSerializer.marks, {
    smallcaps:{ open:"[", close:"]{.smallcaps}", mixable:false, expelEnclosingWhitespace:true }
  })
);
function serializeDoc(doc){
  _fnDefs = [];
  let out = serializer.serialize(doc);
  if (_fnDefs.length){
    const defs = _fnDefs.map((t, i) => {
      const paras = t.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").trim());
      return "[^" + (i+1) + "]: " + paras[0] + paras.slice(1).map(p => "\n\n    " + p).join("");
    });
    out += "\n\n" + defs.join("\n\n");
  }
  return out;
}

/* reference footnotes [^id] + "[^id]: def" (incl. indented multi-paragraph) -> inline ^[def] */
function preprocess(text){
  const defs = {};
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++){
    const m = lines[i].match(/^\[\^([^\]]+)\]:[ \t]*(.*)$/);
    if (m){
      const paras = [m[2].trim()];
      let j = i + 1;
      while (j < lines.length){
        if (/^\s*$/.test(lines[j])){                                   // blank line…
          if (j+1 < lines.length && /^(\t| {2,})\S/.test(lines[j+1])){ // …followed by indent → new paragraph
            paras.push(""); j++; continue;
          }
          break;
        }
        if (/^(\t| {2,})\S/.test(lines[j])){                            // indented continuation
          const t = lines[j].replace(/^(\t| {2,})/, "").trim();
          paras[paras.length-1] = paras[paras.length-1] ? paras[paras.length-1] + " " + t : t;
          j++; continue;
        }
        break;
      }
      defs[m[1].trim()] = paras.filter(p => p !== "").join(PARA);
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  let body = out.join("\n").replace(/\[\^([^\]]+)\]/g, (mm, id) =>
    defs[id.trim()] != null ? "^[" + defs[id.trim()] + "]" : mm);
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- footnote node view + side-panel editor ---------- */
let selectedFnPos = null;
const $fn = document.getElementById("fnText");
class FootnoteView {
  constructor(node, view, getPos){
    this.node=node; this.view=view; this.getPos=getPos;
    this.dom = document.createElement("sup"); this.dom.className="clq-fn"; this.dom.textContent="fn";
    this.dom.title = node.attrs.text;
    if (/\n\s*\n/.test(node.attrs.text)) this.dom.classList.add("multi");
    this.dom.addEventListener("mousedown", e => {
      e.preventDefault();
      const pos = getPos();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      view.focus();
    });
  }
  update(node){
    if(node.type!==this.node.type) return false;
    this.node=node; this.dom.title=node.attrs.text;
    this.dom.classList.toggle("multi", /\n\s*\n/.test(node.attrs.text));
    return true;
  }
  selectNode(){ this.dom.classList.add("sel"); selectedFnPos=this.getPos(); $fn.value=this.node.attrs.text; $fn.focus(); }
  deselectNode(){ this.dom.classList.remove("sel"); selectedFnPos=null; }
  stopEvent(){ return true; }
  ignoreMutation(){ return true; }
}
$fn.addEventListener("input", () => {
  if(selectedFnPos==null) return;
  const tr = view.state.tr.setNodeMarkup(selectedFnPos, null, {text:$fn.value});
  tr.setMeta("addToHistory", true);
  view.dispatch(tr);
});

/* number footnotes in document order after every update */
const numberPlugin = new Plugin({
  view(){ return { update(v){ let n=0; v.dom.querySelectorAll("sup.clq-fn").forEach(el=>{ el.textContent = String(++n); }); } }; }
});

/* ---------- commands & toolbar ---------- */
function insertFootnote(state, dispatch){
  const fn = schema.nodes.footnote.create({text:"New footnote."});
  if(dispatch) dispatch(state.tr.replaceSelectionWith(fn).scrollIntoView());
  return true;
}
const enter = chainCommands(splitListItem(schema.nodes.list_item), createParagraphNear, liftEmptyBlock, splitBlock);
const keys = {
  "Mod-b": toggleMark(schema.marks.strong),
  "Mod-i": toggleMark(schema.marks.em),
  "Shift-Mod-c": toggleMark(schema.marks.smallcaps),
  "Mod-z": undo, "Mod-y": redo, "Shift-Mod-z": redo,
  "Enter": enter,
  "Tab": sinkListItem(schema.nodes.list_item),
  "Shift-Tab": liftListItem(schema.nodes.list_item)
};

const toolbar = [
  ["Bold",    st=>toggleMark(schema.marks.strong)(st.state, st.dispatch)],
  ["Italic",  st=>toggleMark(schema.marks.em)(st.state, st.dispatch)],
  ["SC",      st=>toggleMark(schema.marks.smallcaps)(st.state, st.dispatch)],
  ["sep"],
  ["H1", st=>setBlockType(schema.nodes.heading,{level:1})(st.state,st.dispatch)],
  ["H2", st=>setBlockType(schema.nodes.heading,{level:2})(st.state,st.dispatch)],
  ["H3", st=>setBlockType(schema.nodes.heading,{level:3})(st.state,st.dispatch)],
  ["¶",  st=>setBlockType(schema.nodes.paragraph)(st.state,st.dispatch)],
  ["sep"],
  ["Quote",   st=>wrapIn(schema.nodes.blockquote)(st.state,st.dispatch)],
  ["• List",  st=>wrapInList(schema.nodes.bullet_list)(st.state,st.dispatch)],
  ["1. List", st=>wrapInList(schema.nodes.ordered_list)(st.state,st.dispatch)],
  ["sep"],
  ["Footnote", st=>insertFootnote(st.state, st.dispatch)],
  ["sep"],
  ["Undo", st=>undo(st.state, st.dispatch)],
  ["Redo", st=>redo(st.state, st.dispatch)]
];
const $tb = document.getElementById("toolbar");
for(const item of toolbar){
  if(item[0]==="sep"){ const s=document.createElement("span"); s.className="sep"; $tb.appendChild(s); continue; }
  const b=document.createElement("button"); b.textContent=item[0];
  b.addEventListener("mousedown", e=>{ e.preventDefault(); item[1]({state:view.state, dispatch:view.dispatch.bind(view)}); view.focus(); });
  $tb.appendChild(b);
}

/* ---------- boot the editor ---------- */
const SAMPLE = `# Recent developments in financial services law

This outline reviews several developments in financial services law, beginning with the shift from public to private markets.^[As to the United States, see RB Thompson and DC Langevoort, 'Redrawing the Public/Private Boundaries' (2013) 98 *Cornell L Rev* 1573.]

**Public and private markets** There is a real issue as to a shift from public to private markets. In *Australian Securities and Investments Commission v American Express Australia Ltd* the Federal Court imposed a penalty on [ASIC]{.smallcaps}'s respondents.^[[2024] FCA 784.]

> Absent clear language, the effect of termination will ordinarily only confer a right to terminate on the non-defaulting party.
`;

let view;
function mount(doc){
  if(view) view.destroy();
  const state = EditorState.create({
    doc,
    plugins:[ history(), keymap(keys), keymap(baseKeymap), numberPlugin ]
  });
  view = new EditorView(document.getElementById("editor"), {
    state,
    nodeViews:{ footnote:(node,v,getPos)=>new FootnoteView(node,v,getPos) }
  });
  window.__clqView = view;   // test hook
}
function loadMarkdown(text){ mount(parser.parse(preprocess(text))); }

try{
  loadMarkdown(SAMPLE);
  setStatus("Ready. Edit above; select a footnote to change it; load/save a cla-clq article on the right.");
}catch(err){
  setStatus("Editor failed to load: " + err.message + " — see console. (Needs internet for the ProseMirror modules.)");
  console.error(err);
}

/* ---------- local Markdown in/out ---------- */
document.getElementById("load").addEventListener("click", ()=>{
  const src = document.getElementById("mdio").value.trim();
  if(!src){ setStatus("Paste some Markdown first."); return; }
  try{ loadMarkdown(src); setStatus("Loaded."); }
  catch(err){ setStatus("Parse error: "+err.message); console.error(err); }
});
document.getElementById("export").addEventListener("click", ()=>{
  document.getElementById("mdio").value = serializeDoc(view.state.doc);
  setStatus("Exported Markdown.");
});
document.getElementById("download").addEventListener("click", ()=>{
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([serializeDoc(view.state.doc)],{type:"text/markdown"}));
  a.download="article.md"; a.click();
});

/* ---------- GitHub persistence (JAM-6942) — load/save a cla-clq article ---------- */
const $ghRepo = document.getElementById("ghRepo");
const $ghPath = document.getElementById("ghPath");
const $ghBranch = document.getElementById("ghBranch");
const $ghToken = document.getElementById("ghToken");
const $ghMsg = document.getElementById("ghMsg");
let ghSha = null;   // sha of the loaded file, needed to update it

const LS = "clq-editor-gh";
try{
  const saved = JSON.parse(localStorage.getItem(LS) || "{}");   // never the token
  if(saved.repo) $ghRepo.value = saved.repo;
  if(saved.path) $ghPath.value = saved.path;
  if(saved.branch) $ghBranch.value = saved.branch;
}catch(e){ /* private mode / blocked storage — ignore */ }
function rememberGh(){
  try{ localStorage.setItem(LS, JSON.stringify({repo:$ghRepo.value.trim(), path:$ghPath.value.trim(), branch:$ghBranch.value.trim()})); }catch(e){}
}
function ghMsg(text, cls){ $ghMsg.textContent = text; $ghMsg.className = "ghmsg" + (cls ? " "+cls : ""); }

function b64encodeUtf8(str){
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64decodeUtf8(b64){
  const bin = atob((b64||"").replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function ghParts(){
  const repo = $ghRepo.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  const [owner, name] = repo.split("/");
  const path = $ghPath.value.trim().replace(/^\/+/, "");
  const branch = $ghBranch.value.trim() || "main";
  const token = $ghToken.value.trim();
  if(!owner || !name) throw new Error("Repository must be owner/name, e.g. openlaw-au/cla-clq.");
  if(!path) throw new Error("Enter the file path within the repo.");
  return { owner, name, path, branch, token };
}
function ghUrl(owner, name, path){
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${owner}/${name}/contents/${enc}`;
}
function ghHeaders(token){
  const h = { "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" };
  if(token) h["Authorization"] = "Bearer " + token;
  return h;
}
async function ghErr(r){
  let m = r.statusText; try{ m = (await r.json()).message || m; }catch(e){}
  return new Error(`GitHub ${r.status}: ${m}`);
}

document.getElementById("ghLoad").addEventListener("click", async ()=>{
  let p; try{ p = ghParts(); }catch(e){ ghMsg(e.message, "err"); return; }
  ghMsg("Loading " + p.path + " …");
  try{
    const r = await fetch(ghUrl(p.owner, p.name, p.path) + "?ref=" + encodeURIComponent(p.branch), {headers: ghHeaders(p.token)});
    if(!r.ok) throw await ghErr(r);
    const j = await r.json();
    ghSha = j.sha;
    loadMarkdown(b64decodeUtf8(j.content));
    rememberGh();
    ghMsg("Loaded " + p.path + " @ " + (j.sha||"").slice(0,7) + ".", "ok");
    setStatus("Loaded " + p.path + " from " + p.owner + "/" + p.name + ".");
  }catch(err){ ghMsg(err.message, "err"); console.error(err); }
});

document.getElementById("ghSave").addEventListener("click", async ()=>{
  let p; try{ p = ghParts(); }catch(e){ ghMsg(e.message, "err"); return; }
  if(!p.token){ ghMsg("A token with repo write scope is required to save.", "err"); return; }
  ghMsg("Saving " + p.path + " …");
  try{
    const body = {
      message: "Proof: " + p.path + " (CLQ editor)",
      content: b64encodeUtf8(serializeDoc(view.state.doc) + "\n"),
      branch: p.branch
    };
    if(ghSha) body.sha = ghSha;   // update; omit to create
    const r = await fetch(ghUrl(p.owner, p.name, p.path), {
      method:"PUT", headers:{...ghHeaders(p.token), "Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    if(!r.ok) throw await ghErr(r);
    const j = await r.json();
    ghSha = j.content && j.content.sha;
    rememberGh();
    ghMsg("Saved — commit " + ((j.commit&&j.commit.sha)||"").slice(0,7) + ".", "ok");
    setStatus("Saved " + p.path + " to " + p.owner + "/" + p.name + " (" + p.branch + ").");
  }catch(err){ ghMsg(err.message, "err"); console.error(err); }
});
