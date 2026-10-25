import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageState } from '../lib/paths.mjs';

const cfg = { repo: 'a/b', token: 't' };

test('pageState: no cfg is setup', () => {
  assert.equal(pageState(null, 0, 0), 'setup');
});
test('pageState: 2xx index is ok', () => {
  assert.equal(pageState(cfg, 200, 0), 'ok');
  assert.equal(pageState(cfg, 204, 0), 'ok');
});
test('pageState: 401/403 index is auth', () => {
  assert.equal(pageState(cfg, 401, 0), 'auth');
  assert.equal(pageState(cfg, 403, 0), 'auth');
});
test('pageState: index 404 depends on repo status', () => {
  assert.equal(pageState(cfg, 404, 200), 'empty');
  for (const r of [404, 401, 403]) assert.equal(pageState(cfg, 404, r), 'auth');
  assert.equal(pageState(cfg, 404, 500), 'error');
  assert.equal(pageState(cfg, 404, 0), 'error');
});
test('pageState: anything else is error', () => {
  for (const s of [0, 500, 302, 429]) assert.equal(pageState(cfg, s, 200), 'error');
});
