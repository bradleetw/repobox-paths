import { ghRaw, ghRepoStatus, loadCfg, STEM_RE } from './lib/gh.mjs';
import { pageState, stepView, sourceUrl, isPathsDoc } from './lib/paths.mjs';
import { prepareSvg } from './lib/diagram.mjs';
import { $, el, showSetup, showMessage } from './ui.js';

const root = $('root');
const SVG_NS = 'http://www.w3.org/2000/svg';
const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PREFIX = 'p';

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

function render(doc, svgText) {
  st.doc = doc;
  st.svg = svgText == null ? null : prepareSvg(svgText, PREFIX);
  const kids = [el('h1', { text: doc.full_name })];
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
  root.replaceChildren(...kids);
  chooseEntry(0);
}

async function main() {
  const stem = decodeURIComponent(location.hash.slice(1));
  if (!STEM_RE.test(stem)) return showMessage(root, '網址裡沒有有效的 repo。');
  const cfg = loadCfg();
  if (!cfg || !cfg.token) return showSetup(root, main);
  const p = await ghRaw(cfg, `local/${stem}.paths.json`);
  const repoStatus = p.status === 404 ? await ghRepoStatus(cfg) : 0;
  const state = pageState(cfg, p.status, repoStatus);
  if (state === 'auth') return showMessage(root, 'Token 無效或看不到收藏庫。', true);
  if (state === 'empty') return showMessage(root, '這個 repo 沒有請求路徑資料。');
  if (state === 'error') return showMessage(root, `讀取失敗（HTTP ${p.status}）。`);
  let doc;
  try { doc = JSON.parse(p.text); } catch { doc = null; }
  if (!isPathsDoc(doc) || doc.entries.length === 0) return showMessage(root, 'paths.json 格式不對。');
  const s = await ghRaw(cfg, `local/${stem}.svg`);
  render(doc, s.status >= 200 && s.status < 300 ? s.text : null);
}

document.addEventListener('keydown', (ev) => {
  if (!st.doc || ev.target.closest('input')) return;
  if (ev.key === 'ArrowRight') select(st.step + 1);
  else if (ev.key === 'ArrowLeft') select(st.step - 1);
});
addEventListener('hashchange', () => location.reload());
main();
