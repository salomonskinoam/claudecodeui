import assert from 'node:assert/strict';
import { test } from 'node:test';

import { migratePlacement, resolvePlacement } from '../placement.js';

test('an entry with no record is in the queue', () => {
  assert.deepEqual(resolvePlacement(undefined, 'r1'), { where: 'queue', at: null });
});

test('a hold lasts while the reply it was set on is the current one; a newer reply puts it back in the queue', () => {
  const hold = { where: 'hold' as const, replyAt: 'r1', at: 5 };
  assert.deepEqual(resolvePlacement(hold, 'r1'), { where: 'hold', at: 5 });
  assert.deepEqual(resolvePlacement(hold, 'r2'), { where: 'queue', at: null });
});

test('an archive stays whatever the chat does', () => {
  assert.deepEqual(resolvePlacement({ where: 'archive', at: 7 }, 'r9'), { where: 'archive', at: 7 });
});

test('the two old stores become one flag; an entry in both is archived', () => {
  const out = migratePlacement({ a: 3, b: true }, { b: 'rb', c: 'rc' });
  assert.deepEqual(out, {
    a: { where: 'archive', at: 3 },
    b: { where: 'archive', at: 0 },
    c: { where: 'hold', replyAt: 'rc', at: 0 },
  });
});
