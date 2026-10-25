import { loadCfg, saveCfg } from './lib/gh.mjs';

export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}

export function showSetup(root, onSaved) {
  const repo = el('input', { name: 'repo', value: 'bradleetw/repobox-library', required: '', autocomplete: 'off' });
  const token = el('input', { name: 'token', type: 'password', required: '', autocomplete: 'off' });
  const form = el('form', { class: 'setup' },
    el('p', { text: '貼上有收藏庫讀取權限的 GitHub token。它只存在這個瀏覽器的 localStorage。' }),
    el('label', { text: '收藏庫' }, repo), el('label', { text: 'Token' }, token),
    el('button', { type: 'submit', text: '儲存並讀取' }));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    saveCfg({ repo: repo.value.trim(), token: token.value.trim() });
    onSaved();
  });
  root.replaceChildren(form);
}

export function showMessage(root, text, withReset) {
  const kids = [el('p', { class: 'notice', text })];
  if (withReset) {
    const b = el('button', { type: 'button', text: '重新設定 token' });
    b.addEventListener('click', () => { saveCfg({ repo: 'bradleetw/repobox-library', token: '' }); location.reload(); });
    kids.push(b);
  }
  root.replaceChildren(...kids);
}

export { loadCfg };
