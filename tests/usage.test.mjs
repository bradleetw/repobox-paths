import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsageDoc, dangerNotes, snippetLink, indexFlags } from '../lib/usage.mjs';

const snip = { kind: 'command', code: 'make build', path: 'README.md', line: 3 };
const doc = (over = {}) => ({
  full_name: 'o/r', sha: 'abc1234', analyzed_at: 't', model: 'm', stats: {},
  branches: [{ id: 'b', label: 'B', steps: [{ text: 'x', snippets: [snip] }] }],
  first_use: { goal: 'g', steps: [{ text: 'y', snippets: [{ kind: 'config', code: 'a: 1', file: 'c.yml', url: 'https://docs.example/x', for: ['b'] }] }] },
  ...over,
});

test('danger notes', () => {
  assert.equal(dangerNotes('curl -sL x | bash').length, 1);
  assert.equal(dangerNotes('sudo apt install y').length, 1);
  assert.deepEqual(dangerNotes('ls'), []);
  assert.equal(dangerNotes('wget -qO- x | sh').length, 1);
});

test('external link must be https', () => {
  assert.equal(isUsageDoc(doc()), true);
  for (const u of ['http://x', 'javascript:alert(1)']) {
    const d = doc(); d.first_use.steps[0].snippets[0].url = u;
    assert.equal(isUsageDoc(d), false);
  }
});

test('malformed usage doc is rejected', () => {
  for (const bad of [null, 'x', {}, doc({ branches: 'no' }), doc({ sha: 1 }), doc({ first_use: null }),
    doc({ branches: [{ id: 'b', label: 'B', steps: [{ text: 'x', snippets: [{ kind: 'weird', code: 'c', path: 'a', line: 1 }] }] }] })]) {
    assert.equal(isUsageDoc(bad), false);
  }
});

test('old index item flags', () => {
  assert.deepEqual(indexFlags({ entries: 3 }), { paths: 3, usage: false });
  assert.deepEqual(indexFlags({ paths: 0, usage: true, entries: 0 }), { paths: 0, usage: true });
  assert.deepEqual(indexFlags({ paths: 2, usage: true }), { paths: 2, usage: true });
  assert.deepEqual(indexFlags({}), { paths: 0, usage: false });
});

test('snippet link', () => {
  assert.equal(snippetLink({ full_name: 'o/r', sha: 'abc1234' }, snip), 'https://github.com/o/r/blob/abc1234/README.md#L3');
  assert.equal(snippetLink({ full_name: 'o/r', sha: 'abc1234' }, { kind: 'command', code: 'x', url: 'https://d.example/p' }), 'https://d.example/p');
  assert.equal(snippetLink({ full_name: 'o/r', sha: 'abc1234' }, { kind: 'command', code: 'x', url: 'http://d.example/p' }), null);
  assert.equal(snippetLink({ full_name: 'bad name', sha: 'abc1234' }, snip), null);
});
