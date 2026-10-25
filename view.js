import { ghRaw, ghRepoStatus, loadCfg, STEM_RE } from './lib/gh.mjs';
import { pageState, stepView, sourceUrl, isPathsDoc } from './lib/paths.mjs';
import { prepareSvg } from './lib/diagram.mjs';
import { isUsageDoc, dangerNotes, snippetLink, indexFlags } from './lib/usage.mjs';
import { $, el, showSetup, showMessage } from './ui.js';

const root = $('root');
const SVG_NS = 'http://www.w3.org/2000/svg';
const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PREFIX = 'p';

let panel = root;
const st = { doc: null, svg: null, entry: 0, step: 0, list: null, buttons: [], hasDiagram: false };

const svgEl = (tag, attrs) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

function entry() { return st.doc.entries[st.entry]; }

function select(step) {
  const n = entry().steps.length;
  st.step = Math.min(Math.max(step, 0), n - 1);
  paint();
}

function paintList() {
  [...st.list.children].forEach((li, i) => li.classList.toggle('cur', i === st.step));
  const cur = st.list.children[st.step];
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
}

function drawBadges(svg, nodes) {
  svg.querySelectorAll('.badge').forEach((b) => b.remove());
  for (const [id, nums] of nodes) {
    const rect = svg.querySelector(`[id="${id}"] rect`);
    if (!rect) continue;
    const x = Number(rect.getAttribute('x')), y = Number(rect.getAttribute('y')), w = Number(rect.getAttribute('width'));
    if (![x, y, w].every(Number.isFinite)) continue;
    nums.forEach((num, k) => {
      const cx = x + w - 6 - (nums.length - 1 - k) * 26, cy = y;
      const g = svgEl('g', { class: num === st.step + 1 ? 'badge cur' : 'badge', 'data-step': num });
      g.append(svgEl('circle', { cx, cy, r: 11 }));
      const t = svgEl('text', { x: cx, y: cy });
      t.textContent = String(num);
      g.append(t);
      svg.append(g);
    });
  }
}

function paintDiagram() {
  const svg = st.svg;
  const ids = new Set([...svg.querySelectorAll('[id]')].map((e) => e.id));
  const view = stepView(entry(), st.step, PREFIX, (id) => ids.has(id));
  for (const n of svg.querySelectorAll('.node')) {
    n.classList.remove('on', 'cur', 'dim');
    n.classList.add(view.nodes.has(n.id) ? 'on' : 'dim');
    if (n.id === view.currentNode) n.classList.add('cur');
  }
  const lit = new Set(view.edges);
  for (const e of svg.querySelectorAll('.edge')) {
    e.classList.remove('on', 'dim');
    e.classList.add(lit.has(e.id) ? 'on' : 'dim');
  }
  for (const l of svg.querySelectorAll('.label')) {
    const edge = `${PREFIX}-${l.getAttribute('data-edge')}`;
    l.classList.toggle('dim', !lit.has(edge));
  }
  drawBadges(svg, view.nodes);
}

function paint() {
  st.buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === st.entry)));
  paintList();
  if (st.svg) paintDiagram();
}

function buildList() {
  const ol = el('ol', { class: 'steps' });
  const { full_name, sha } = st.doc;
  entry().steps.forEach((s, i) => {
    const src = s.source;
    const label = `${src.path}:${src.line}${src.symbol ? ` · ${src.symbol}` : ''}`;
    let srcNode = el('span', { text: label });
    if (FULL_NAME_RE.test(full_name) && /^[0-9a-f]{7,40}$/.test(sha)) {
      srcNode = el('a', { href: sourceUrl(full_name, sha, src), target: '_blank', rel: 'noopener noreferrer', text: label });
    }
    const li = el('li', {}, el('span', { class: 'num', text: String(i + 1) }),
      el('div', {}, el('div', { text: s.text }), el('span', { class: 'src' }, srcNode)));
    li.addEventListener('click', (ev) => { if (!ev.target.closest('a')) select(i); });
    ol.append(li);
  });
  st.list.replaceWith(ol);
  st.list = ol;
}

function chooseEntry(i) {
  st.entry = i;
  st.step = 0;
  buildList();
  paint();
}

function onDiagramClick(ev) {
  const badge = ev.target.closest('.badge');
  if (badge) return select(Number(badge.getAttribute('data-step')) - 1);
  const node = ev.target.closest('.node');
  if (!node || !node.classList.contains('on')) return;
  const nums = [];
  entry().steps.forEach((s, i) => { if (`${PREFIX}-${s.node}` === node.id) nums.push(i); });
  // On a repeated node, successive clicks walk through its visits.
  select(nums.find((i) => i > st.step) ?? nums[0]);
}

function renderPaths(doc, svgText) {
  st.doc = doc;
  st.svg = svgText == null ? null : prepareSvg(svgText, PREFIX);
  const kids = [];
  if (st.svg == null) {
    kids.push(el('p', { class: 'notice', text: svgText == null ? '找不到架構圖，只顯示步驟清單。' : '架構圖沒通過安全檢查，只顯示步驟清單。' }));
  }
  const bar = el('div', { class: 'entries' });
  st.buttons = doc.entries.map((e, i) => {
    const b = el('button', { type: 'button', 'aria-pressed': 'false' }, document.createTextNode(e.label), el('small', { text: e.trigger }));
    b.addEventListener('click', () => chooseEntry(i));
    bar.append(b);
    return b;
  });
  st.list = el('ol');
  const layout = el('div', { class: st.svg ? 'layout' : 'layout nodia' });
  if (st.svg) {
    const fig = el('div', { class: 'fig' }, st.svg);
    fig.addEventListener('click', onDiagramClick);
    layout.append(fig);
  }
  layout.append(st.list);
  kids.push(bar, layout);
  panel.replaceChildren(...kids);
  chooseEntry(0);
}

// ---- usage tab ----

async function copyCode(btn, code, codeEl) {
  try {
    await navigator.clipboard.writeText(code);
    btn.textContent = '已複製';
  } catch {
    const r = document.createRange();
    r.selectNodeContents(codeEl);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    btn.textContent = '已選取，請按 ⌘C／Ctrl+C';
  }
  setTimeout(() => { btn.textContent = '複製'; }, 2000);
}

function snippetNode(doc, sn, labels) {
  const code = el('code');
  code.textContent = sn.code;
  const btn = el('button', { type: 'button', class: 'copy', text: '複製' });
  btn.addEventListener('click', () => copyCode(btn, sn.code, code));
  const head = el('div', { class: 'snip-head' },
    el('span', { class: 'kind', text: sn.kind === 'config' && sn.file ? `存成 ${sn.file}` : (sn.kind === 'config' ? '設定' : '指令') }), btn);
  const box = el('div', { class: `snip ${sn.kind}` }, head, el('pre', {}, code));
  for (const note of dangerNotes(sn.code)) box.append(el('div', { class: 'danger', text: note }));
  if (sn.for && sn.for.length) {
    box.append(el('div', { class: 'only', text: `只適用 ${sn.for.map((id) => labels.get(id) || id).join('、')}` }));
  }
  const href = snippetLink(doc, sn);
  const label = sn.path ? `${sn.path}:${sn.line}` : (() => { try { return new URL(sn.url).host; } catch { return '文件'; } })();
  box.append(el('span', { class: 'src' }, href
    ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: label })
    : el('span', { text: label })));
  return box;
}

function stepNode(doc, s, i, labels) {
  const body = el('div', {}, el('div', { text: s.text }));
  if (s.unverified || s.snippets.length === 0) body.append(el('div', { class: 'unverified', text: '沒有可驗證的指令' }));
  for (const sn of s.snippets) body.append(snippetNode(doc, sn, labels));
  return el('li', { class: s.unverified ? 'ustep unv' : 'ustep' }, el('span', { class: 'num', text: String(i + 1) }), body);
}

function renderUsage(doc) {
  st.doc = null;
  const labels = new Map(doc.branches.map((b) => [b.id, b.label]));
  const kids = [el('p', { class: 'notice warn', text: '指令都從 repo 或官方文件原樣抄出；文件本身若過期，照打也可能失敗。' })];
  if (doc.branches.length) {
    const grid = el('div', { class: 'branches', style: `--cols:${Math.min(doc.branches.length, 4)}` });
    for (const b of doc.branches) {
      const ol = el('ol', { class: 'usteps' });
      b.steps.forEach((s, i) => ol.append(stepNode(doc, s, i, labels)));
      grid.append(el('section', { class: 'branch', 'data-branch': b.id }, el('h2', { text: b.label }), ol));
    }
    kids.push(grid);
  }
  if (doc.first_use) {
    if (doc.branches.length) kids.push(el('div', { class: 'merge', 'aria-hidden': 'true', text: '↓ 裝好之後' }));
    const ol = el('ol', { class: 'usteps' });
    doc.first_use.steps.forEach((s, i) => ol.append(stepNode(doc, s, i, labels)));
    kids.push(el('section', { class: 'firstuse' }, el('h2', { text: doc.first_use.goal }), ol));
  }
  panel.replaceChildren(...kids);
}

// ---- shell ----

const cache = {};

async function loadDoc(cfg, stem, tab) {
  if (cache[tab]) return cache[tab];
  const base = `local/${stem}`;
  if (tab === 'usage') {
    const r = await ghRaw(cfg, `${base}.usage.json`);
    if (r.status < 200 || r.status >= 300) return { error: `讀取失敗（HTTP ${r.status}）。` };
    let d; try { d = JSON.parse(r.text); } catch { d = null; }
    if (!isUsageDoc(d)) return { error: 'usage.json 格式不對。' };
    return (cache[tab] = { doc: d });
  }
  const r = await ghRaw(cfg, `${base}.paths.json`);
  if (r.status < 200 || r.status >= 300) return { error: `讀取失敗（HTTP ${r.status}）。` };
  let d; try { d = JSON.parse(r.text); } catch { d = null; }
  if (!isPathsDoc(d) || d.entries.length === 0) return { error: 'paths.json 格式不對。' };
  const s = await ghRaw(cfg, `${base}.svg`);
  return (cache[tab] = { doc: d, svg: s.status >= 200 && s.status < 300 ? s.text : null });
}

function parseHash() {
  let h;
  try { h = decodeURIComponent(location.hash.slice(1)); } catch { return null; }
  const [stem, tab = ''] = h.split('/');
  if (!STEM_RE.test(stem) || (tab !== '' && tab !== 'usage')) return null;
  return { stem, tab: tab === 'usage' ? 'usage' : 'paths' };
}

async function main() {
  const h = parseHash();
  if (!h) return showMessage(root, '網址裡沒有有效的 repo。');
  const { stem } = h;
  const cfg = loadCfg();
  if (!cfg || !cfg.token) return showSetup(root, main);
  const idx = await ghRaw(cfg, 'local/index.json');
  const repoStatus = idx.status === 404 ? await ghRepoStatus(cfg) : 0;
  const state = pageState(cfg, idx.status, repoStatus);
  if (state === 'auth') return showMessage(root, 'Token 無效或看不到收藏庫。', true);
  if (state === 'empty') return showMessage(root, '這個 repo 沒有分析資料。');
  if (state === 'error') return showMessage(root, `讀取失敗（HTTP ${idx.status}）。`);
  let items;
  try { items = JSON.parse(idx.text).items; } catch { items = null; }
  if (!Array.isArray(items)) return showMessage(root, 'index.json 格式不對。');
  const item = items.find((it) => it && it.stem === stem);
  if (!item) return showMessage(root, '收藏庫的索引裡沒有這個 repo。');
  const flags = indexFlags(item);
  const avail = { paths: flags.paths > 0, usage: flags.usage };
  if (!avail.paths && !avail.usage) return showMessage(root, '這個 repo 沒有請求路徑也沒有使用流程資料。');

  const TABS = [['paths', '請求路徑', '這次分析沒有請求路徑'], ['usage', '使用流程', '這次分析沒有使用流程']];
  const tabBtns = {};
  const bar = el('div', { class: 'tabs', role: 'tablist' });
  for (const [key, label, none] of TABS) {
    const b = el('button', { type: 'button', role: 'tab', 'data-tab': key, 'aria-selected': 'false' }, document.createTextNode(label));
    if (avail[key]) b.addEventListener('click', () => show(key, true));
    else { b.disabled = true; b.append(el('small', { text: none })); }
    tabBtns[key] = b;
    bar.append(b);
  }
  panel = el('div', { class: 'panel', role: 'tabpanel' });
  const fullName = String(item.full_name || stem);
  root.replaceChildren(el('h1', { text: fullName }), bar, panel);

  let seq = 0;
  async function show(tab, record) {
    const mine = ++seq;
    for (const k of Object.keys(tabBtns)) tabBtns[k].setAttribute('aria-selected', String(k === tab));
    if (record) history.replaceState(null, '', tab === 'usage' ? `#${stem}/usage` : `#${stem}`);
    panel.replaceChildren(el('p', { class: 'muted', text: '讀取中…' }));
    st.doc = null;
    const r = await loadDoc(cfg, stem, tab);
    if (mine !== seq) return;
    if (r.error) return showMessage(panel, r.error);
    if (tab === 'usage') renderUsage(r.doc); else renderPaths(r.doc, r.svg);
  }
  const first = avail[h.tab] ? h.tab : (avail.paths ? 'paths' : 'usage');
  await show(first, first !== h.tab);
}

document.addEventListener('keydown', (ev) => {
  if (!st.doc || ev.target.closest('input')) return;
  if (ev.key === 'ArrowRight') select(st.step + 1);
  else if (ev.key === 'ArrowLeft') select(st.step - 1);
});
addEventListener('hashchange', () => location.reload());
main();
