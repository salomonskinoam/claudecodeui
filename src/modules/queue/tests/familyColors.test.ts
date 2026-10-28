import assert from 'node:assert/strict';

import { test } from 'vitest';

import { assignColors, type Family, PALETTE } from '@/modules/queue/familyColors';

const families = (n: number, open = 0): Family[] => Array.from({ length: n }, (_, i) => ({ key: `f${i}`, open: i < open }));

test('a family keeps its color, whatever the order or the newcomers', () => {
  const first = assignColors(families(5, 2), new Map());
  const again = assignColors([...families(8, 3)].reverse(), first);
  for (const [k, c] of first) assert.equal(again.get(k), c);
});

test('the first ten families wear the ten base colors, the eleventh a lighter shade', () => {
  const out = assignColors(families(11), new Map());
  assert.deepEqual(new Set([...out.values()].slice(0, 10)), new Set(PALETTE.slice(0, 10)));
  assert.ok(PALETTE.indexOf(out.get('f10') as string) >= 10);
});

test('when the family on a base color is gone, the family on its lighter shade takes the base', () => {
  const given = assignColors(families(11), new Map());
  const shade1 = given.get('f10') as string;
  assert.equal(PALETTE.indexOf(shade1), 10); // the lighter shade of the first color
  const after = assignColors(families(11).filter((f) => f.key !== 'f0'), given);
  assert.equal(after.get('f10'), PALETTE[0]);
  for (let i = 1; i < 10; i += 1) assert.equal(after.get(`f${i}`), given.get(`f${i}`)); // nobody else moves
});

test('open families stay apart: a new family avoids every color an open family wears', () => {
  const given = new Map([...families(10)].map((f, i) => [f.key, PALETTE[i]]));
  const out = assignColors([...families(10, 3), { key: 'new', open: true }], given);
  const openColors = new Set(families(10, 3).filter((f) => f.open).map((f) => out.get(f.key)));
  assert.ok(!openColors.has(out.get('new')));
});
