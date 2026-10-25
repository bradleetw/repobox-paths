import { ghRaw, ghRepoStatus, loadCfg, STEM_RE } from './lib/gh.mjs';
import { pageState } from './lib/paths.mjs';
import { indexFlags } from './lib/usage.mjs';
import { $, el, showSetup, showMessage } from './ui.js';

const root = $('root');

function renderList(items) {
  const ul = el('ul', { class: 'cards' });
  for (const it of items) {
    if (!it || !STEM_RE.test(String(it.stem))) continue;
    const f = indexFlags(it);
    const tags = el('div', { class: 'tags' });
    if (f.paths > 0) tags.append(el('span', { class: 'pill', text: `請求路徑 ${f.paths} 條` }));
    if (f.usage) tags.append(el('span', { class: 'pill', text: '使用流程' }));
    const a = el('a', { class: 'card', href: `view.html#${it.stem}` },
      el('div', { class: 'name', text: String(it.full_name) }),
      el('div', { class: 'tag', text: String(it.tagline || '') }),
      tags,
      el('div', { class: 'muted', text: String(it.analyzed_at || '').slice(0, 10) }));
    ul.append(el('li', {}, a));
  }
  root.replaceChildren(ul);
}

async function main() {
  const cfg = loadCfg();
  if (pageState(cfg, 0, 0) === 'setup' || !cfg.token) return showSetup(root, main);
  const idx = await ghRaw(cfg, 'local/index.json');
  const repoStatus = idx.status === 404 ? await ghRepoStatus(cfg) : 0;
  const st = pageState(cfg, idx.status, repoStatus);
  if (st === 'auth') return showMessage(root, 'Token 無效或看不到收藏庫。', true);
  if (st === 'empty') return showMessage(root, '還沒有任何 repo 分析過請求路徑。');
  if (st === 'error') return showMessage(root, `讀取失敗（HTTP ${idx.status}）。`);
  let items;
  try { items = JSON.parse(idx.text).items; } catch { items = null; }
  if (!Array.isArray(items)) return showMessage(root, 'index.json 格式不對。');
  renderList(items);
}
main();
