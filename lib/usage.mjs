// Pure helpers for the usage-flow tab (install -> configure -> first use).
import { sourceUrl } from './paths.mjs';

const str = (v) => typeof v === 'string';
const FULL_NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;

export function isHttps(u) {
  if (!str(u)) return false;
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

const snippetOk = (s) => !!s && (s.kind === 'command' || s.kind === 'config') && str(s.code)
  && (s.file === undefined || str(s.file))
  && (s.for === undefined || (Array.isArray(s.for) && s.for.every(str)))
  && ((str(s.path) && Number.isInteger(s.line)) || isHttps(s.url))
  && (s.url === undefined || isHttps(s.url));
const stepOk = (s) => !!s && str(s.text) && Array.isArray(s.snippets) && s.snippets.every(snippetOk);
const branchOk = (b) => !!b && str(b.id) && str(b.label) && Array.isArray(b.steps) && b.steps.every(stepOk);

export function isUsageDoc(x) {
  return !!x && typeof x === 'object' && str(x.full_name) && str(x.sha)
    && Array.isArray(x.branches) && x.branches.every(branchOk)
    && (x.first_use === undefined || x.first_use === null
      || (typeof x.first_use === 'object' && str(x.first_use.goal)
        && Array.isArray(x.first_use.steps) && x.first_use.steps.every(stepOk)));
}

const SHELL = '(?:ba|z|da|k)?sh';
const PIPE_SHELL = new RegExp(
  `\\|\\s*(?:sudo(?:\\s+-\\S+)*\\s+)?${SHELL}\\b`
  + `|\\b${SHELL}\\s+-c\\s+["']?\\$\\(\\s*(?:curl|wget)\\b`
  + `|\\b${SHELL}\\s+<\\(\\s*(?:curl|wget)\\b`);

// rm with both a recursive (r/R) and a force (f) flag, in one cluster or several.
function rmRecursiveForce(code) {
  for (const m of code.matchAll(/(?:^|[\s;&|(])rm((?:\s+-[^\s]*)+)(?=\s|$)/g)) {
    const flags = m[1].split(/\s+/).filter((f) => /^-[^-]/.test(f)).join('');
    if (/[rR]/.test(flags) && /f/.test(flags)) return true;
  }
  return false;
}

const DANGER = [
  [(c) => PIPE_SHELL.test(c), '會直接執行網路上抓下來的腳本，先讀懂再跑'],
  [(c) => /(^|[\s;&|(])sudo\b/.test(c), '需要管理權限，先讀懂再跑'],
  [rmRecursiveForce, '會直接刪除檔案，先讀懂再跑'],
  [(c) => /\bchmod\s+(-\S+\s+)*0?777\b/.test(c), '權限全開，先讀懂再跑'],
  [(c) => /\bdocker\s+run\b[^\n]*--privileged/.test(c), '會給容器完整的主機權限，先讀懂再跑'],
];

export function dangerNotes(code) {
  const c = String(code);
  return DANGER.filter(([test]) => test(c)).map(([, note]) => note);
}

export function snippetLink(doc, snippet) {
  if (str(snippet.path) && Number.isInteger(snippet.line)) {
    return FULL_NAME_RE.test(doc.full_name) && SHA_RE.test(doc.sha) ? sourceUrl(doc.full_name, doc.sha, snippet) : null;
  }
  return isHttps(snippet.url) ? snippet.url : null;
}

export function indexFlags(item) {
  const it = item || {};
  const n = Number.isInteger(it.paths) ? it.paths : (Number.isInteger(it.entries) ? it.entries : 0);
  return { paths: n, usage: it.usage === true };
}
