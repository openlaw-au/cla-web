
import {Schema} from "prosemirror-model";
import {EditorState, NodeSelection, Plugin} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {schema as basic} from "prosemirror-schema-basic";
import {addListNodes, wrapInList, splitListItem, liftListItem, sinkListItem} from "prosemirror-schema-list";
import {MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer} from "prosemirror-markdown";
import MarkdownIt from "markdown-it";
import {history, undo, redo} from "prosemirror-history";
import {keymap} from "prosemirror-keymap";
import {baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock} from "prosemirror-commands";

const $status = document.getElementById("status");
const setStatus = m => { $status.textContent = m; };

/* ---------- schema: basic + lists + a footnote inline node ---------- */
const nodes = addListNodes(basic.spec.nodes, "paragraph block*", "block")
  .addToEnd("footnote", {
    inline:true, group:"inline", atom:true, selectable:true, draggable:false,
    attrs:{ text:{default:""} },
    toDOM(node){ return ["sup", {class:"clq-fn", title:node.attrs.text}, "fn"]; },
    parseDOM:[{ tag:"sup.clq-fn", getAttrs:d=>({text:d.getAttribute("title")||""}) }]
  });
const schema = new Schema({ nodes, marks: basic.spec.marks });

/* ---------- markdown-it with an inline ^[...] footnote rule ---------- */
const md = MarkdownIt("commonmark", {html:false});
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
  link:{mark:"link", getAttrs:t=>({href:t.attrGet("href"), title:t.attrGet("title")||null})},
  footnote:{node:"footnote", getAttrs:t=>({text:t.content})}
});

const serializer = new MarkdownSerializer(
  Object.assign({}, defaultMarkdownSerializer.nodes, {
    footnote(state, node){ state.text("^[" + node.attrs.text + "]", false); }
  }),
  defaultMarkdownSerializer.marks
);

/* reference footnotes [^id] + "[^id]: def"  ->  inline ^[def] before parsing */
function preprocess(text){
  const defs = {};
  text = text.replace(/^\[\^([^\]]+)\]:[ \t]*(.*)$/gm, (_, id, def) => { defs[id.trim()] = def.trim(); return ""; });
  text = text.replace(/\[\^([^\]]+)\]/g, (m, id) => defs[id.trim()] != null ? "^[" + defs[id.trim()] + "]" : m);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- footnote node view + a side panel to edit it ---------- */
let selectedFnPos = null;
const $fn = document.getElementById("fnText");
class FootnoteView {
  constructor(node, view, getPos){
    this.node=node; this.view=view; this.getPos=getPos;
    this.dom = document.createElement("sup"); this.dom.className="clq-fn"; this.dom.textContent="fn";
    this.dom.title = node.attrs.text;
    this.dom.addEventListener("mousedown", e => {
      e.preventDefault();
      const pos = getPos();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      view.focus();
    });
  }
  update(node){ if(node.type!==this.node.type) return false; this.node=node; this.dom.title=node.attrs.text; return true; }
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

/* number the footnotes in document order after every update */
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
  "Mod-z": undo, "Mod-y": redo, "Shift-Mod-z": redo,
  "Enter": enter,
  "Tab": sinkListItem(schema.nodes.list_item),
  "Shift-Tab": liftListItem(schema.nodes.list_item)
};

const toolbar = [
  ["Bold",    st=>toggleMark(schema.marks.strong)(st.state, st.dispatch)],
  ["Italic",  st=>toggleMark(schema.marks.em)(st.state, st.dispatch)],
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

**Public and private markets** There is a real issue as to a shift from public to private markets, in relation to both equity and credit markets. In *Australian Securities and Investments Commission v American Express Australia Ltd* the Federal Court imposed a substantial penalty.^[[2024] FCA 784.]

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
}
try{
  mount(parser.parse(preprocess(SAMPLE)));
  setStatus("Ready. Edit above; select a footnote to change it; Export Markdown when done.");
}catch(err){
  setStatus("Editor failed to load: " + err.message + " — see console. (Needs internet for the ProseMirror modules.)");
  console.error(err);
}

document.getElementById("load").addEventListener("click", ()=>{
  const src = document.getElementById("mdio").value.trim();
  if(!src){ setStatus("Paste some Markdown first."); return; }
  try{ mount(parser.parse(preprocess(src))); setStatus("Loaded."); }
  catch(err){ setStatus("Parse error: "+err.message); console.error(err); }
});
document.getElementById("export").addEventListener("click", ()=>{
  const out = serializer.serialize(view.state.doc);
  document.getElementById("mdio").value = out;
  setStatus("Exported Markdown (footnotes as ^[…]).");
});
document.getElementById("download").addEventListener("click", ()=>{
  const out = serializer.serialize(view.state.doc);
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([out],{type:"text/markdown"}));
  a.download="article.md"; a.click();
});
