import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementAllowed, attrAllowed } from '../lib/diagram.mjs';

test('script and foreignObject fail the allowlist', () => {
  for (const name of ['script', 'foreignObject', 'image', 'style', 'a', 'iframe']) assert.equal(elementAllowed(name), false, name);
  for (const name of ['svg', 'g', 'use', 'marker', 'symbol', 'path', 'text']) assert.equal(elementAllowed(name), true, name);
});

test('attribute rules match validate.py', () => {
  const bad = [['onload', 'x()'], ['style', 'fill:red'], ['href', 'https://x/y.svg#a'], ['fill', 'url(http://x)'],
    ['marker-end', '\\75 rl(x)'], ['href', 'data:image/svg+xml,abc'], ['fill', 'javascript:alert(1)'], ['xlink', 'x'],
    ['marker-end', 'url(#ah) url(http://x)']];
  for (const [n, v] of bad) assert.equal(attrAllowed(n, v), false, `${n}=${v}`);
  const good = [['href', '#icon-x'], ['marker-end', 'url(#ah)'], ['fill', '#1a1a1a'], ['d', 'M0 0H10'], ['class', 'node']];
  for (const [n, v] of good) assert.equal(attrAllowed(n, v), true, `${n}=${v}`);
});
