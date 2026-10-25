// GitHub Contents API reader and local config.
// ghRaw, headers and STEM_RE follow cholateio/repobox web/lib/library.mjs at commit 60e57ed
// (MIT License, Copyright (c) 2026 cholateio; see LICENSE).

export const STEM_RE = /^[a-z0-9._-]+__[a-z0-9._-]+$/;
const API = 'https://api.github.com/repos';
const KEY = 'repobox-paths.cfg';

function headers(cfg, accept) {
  return { Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
}

// Returns {repo, token} or null when nothing usable is stored (or storage is unavailable).
export function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    return c && typeof c.repo === 'string' && typeof c.token === 'string' ? { repo: c.repo, token: c.token } : null;
  } catch {
    return null;
  }
}

export function saveCfg(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify({ repo: cfg.repo, token: cfg.token })); } catch { /* storage unavailable */ }
}

// no-cache: the API answers with max-age=60, which would keep showing stale data after a publish.
export async function ghRaw(cfg, path, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${API}/${cfg.repo}/contents/${path}`, { headers: headers(cfg, 'application/vnd.github.raw+json'), cache: 'no-cache' });
    return { status: res.status, text: res.ok ? await res.text() : null };
  } catch {
    return { status: 0, text: null };
  }
}
