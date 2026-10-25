import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeId, stepView, sourceUrl, isPathsDoc } from '../lib/paths.mjs';
import { loadCfg, saveCfg, ghRaw, STEM_RE } from '../lib/gh.mjs';

const src = { path: 'a.py', symbol: 'f', line: 1 };
const entry = { id: 'r1', label: 'L', trigger: 'T', steps: [
  { node: 'n-ui', text: 'a', source: src }, { node: 'n-api', text: 'b', source: src },
  { node: 'n-config', text: 'c', source: src }, { node: 'n-api', text: 'd', source: src }] };

test('edge lookup strips n- and tries both directions', () => {
  assert.equal(edgeId('n-ui', 'n-config', (id) => id === 'p-e-ui-config', 'p'), 'p-e-ui-config');
  assert.equal(edgeId('n-config', 'n-ui', (id) => id === 'p-e-ui-config', 'p'), 'p-e-ui-config');
  assert.equal(edgeId('n-ui', 'n-x', () => false, 'p'), null);
});

test('repeated node keeps both step numbers', () => {
  const v = stepView(entry, 1, 'p');
  assert.deepEqual(v.nodes.get('p-n-api'), [2, 4]);
  assert.deepEqual(v.nodes.get('p-n-ui'), [1]);
  assert.equal(v.currentNode, 'p-n-api');
});

test('prefix is applied to node ids', () => {
  const v = stepView(entry, 2, 'p', () => true);
  for (const id of v.nodes.keys()) assert.ok(id.startsWith('p-'), id);
  assert.ok(v.currentNode.startsWith('p-'));
  assert.deepEqual(v.edges, ['p-e-ui-api', 'p-e-api-config']);
});

test('edges only cover steps reached so far and skip missing ones', () => {
  assert.deepEqual(stepView(entry, 0, 'p').edges, []);
  const has = (id) => id === 'p-e-config-api';
  assert.deepEqual(stepView(entry, 3, 'p', has).edges, ['p-e-config-api']);
});

test('source url pins the commit and line', () => {
  assert.equal(sourceUrl('o/r', 'abc123', { path: 'src/a b/c#.py', symbol: 'f', line: 42 }),
    'https://github.com/o/r/blob/abc123/src/a%20b/c%23.py#L42');
});

test('malformed paths doc is rejected', () => {
  const ok = { full_name: 'o/r', sha: 'abc', analyzed_at: 't', model: 'm', stats: {}, entries: [entry] };
  assert.equal(isPathsDoc(ok), true);
  for (const bad of [null, 'x', {}, { ...ok, entries: 'no' }, { ...ok, sha: 1 },
    { ...ok, entries: [{ ...entry, steps: [{ node: 1 }] }] }, { ...ok, entries: [{ ...entry, steps: 'x' }] }]) {
    assert.equal(isPathsDoc(bad), false);
  }
});

test('cfg round-trips through localStorage and survives broken storage', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveCfg({ repo: 'o/r', token: 't' });
  assert.ok(store.has('repobox-paths.cfg'));
  assert.deepEqual(loadCfg(), { repo: 'o/r', token: 't' });
  store.set('repobox-paths.cfg', '{bad');
  assert.equal(loadCfg(), null);
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(loadCfg(), null);
  assert.doesNotThrow(() => saveCfg({ repo: 'a', token: 'b' }));
  delete globalThis.localStorage;
});

test('ghRaw sends auth, no-cache, and maps status', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, text: async () => 'hi' }; };
  assert.deepEqual(await ghRaw({ repo: 'o/r', token: 't' }, 'local/index.json', f), { status: 200, text: 'hi' });
  assert.equal(seen.url, 'https://api.github.com/repos/o/r/contents/local/index.json');
  assert.equal(seen.init.cache, 'no-cache');
  assert.equal(seen.init.headers.Authorization, 'Bearer t');
  assert.deepEqual(await ghRaw({ repo: 'o/r', token: 't' }, 'x', async () => { throw new Error('net'); }), { status: 0, text: null });
  assert.ok(STEM_RE.test('o__r'));
});
