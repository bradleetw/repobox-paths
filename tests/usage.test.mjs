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
  for (const bad of [null, 'x', {}, doc({ branches: 'no' }), doc({ sha: 1 }),
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

test('first_use is optional, branches may be empty', () => {
  const d = doc(); delete d.first_use;
  assert.equal(isUsageDoc(d), true);
  assert.equal(isUsageDoc(doc({ first_use: null })), true);
  assert.equal(isUsageDoc(doc({ branches: [] })), true);
  assert.equal(isUsageDoc(doc({ first_use: { goal: 1, steps: [] } })), false);
});

test('chmod 777 is flagged', () => {
  for (const c of ['chmod 777 x', 'chmod -R 777 d', 'chmod 0777 x']) assert.equal(dangerNotes(c).length, 1, c);
  assert.deepEqual(dangerNotes('chmod 755 x'), []);
});

test('rm needs both recursive and force', () => {
  for (const c of ['rm -rf x', 'rm -fr x', 'rm -Rf x', 'rm -r -f x', 'cd d && rm -rf']) assert.equal(dangerNotes(c).length, 1, c);
  for (const c of ['rm -r build', 'rm -f a.txt', 'rm a.txt']) assert.deepEqual(dangerNotes(c), [], c);
});

test('pipe-to-shell variants', () => {
  for (const c of ['cat x | sh', 'echo y | bash', 'echo y | zsh', 'sh -c "$(curl -fsSL https://x)"',
    'bash -c "$(wget -qO- https://x)"', 'bash <(curl -s https://x)', 'curl -sL https://x \\\n  | bash']) {
    assert.equal(dangerNotes(c).length, 1, c);
  }
  const n = dangerNotes('curl https://x | sudo -E bash');
  assert.equal(n.length, 2);
  assert.ok(n.some((x) => x.includes('會直接執行')));
  assert.deepEqual(dangerNotes('sha256sum f | shasum'), []);
});
