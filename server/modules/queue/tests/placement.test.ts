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

test('an archive stays while the chat does nothing', () => {
  assert.deepEqual(resolvePlacement({ where: 'archive', at: 7 }, 'r9'), { where: 'archive', at: 7 });
  assert.deepEqual(resolvePlacement({ where: 'archive', at: 7 }, 'r9', 7), { where: 'archive', at: 7 });
});

test('any activity after the placement puts a held or archived chat back in the queue; older activity does not', () => {
  const hold = { where: 'hold' as const, replyAt: 'r1', at: 100 };
  const archive = { where: 'archive' as const, at: 100 };
  assert.deepEqual(resolvePlacement(hold, 'r1', 90), { where: 'hold', at: 100 });
  assert.deepEqual(resolvePlacement(hold, 'r1', 101), { where: 'queue', at: null });
  assert.deepEqual(resolvePlacement(archive, 'r1', 90), { where: 'archive', at: 100 });
  assert.deepEqual(resolvePlacement(archive, 'r1', 101), { where: 'queue', at: null });
});

test('the two old stores become one flag; an entry in both is archived', () => {
  const out = migratePlacement({ a: 3, b: true }, { b: 'rb', c: 'rc' });
  assert.deepEqual(out, {
    a: { where: 'archive', at: 3 },
    b: { where: 'archive', at: 0 },
    c: { where: 'hold', replyAt: 'rc', at: 0 },
  });
});
