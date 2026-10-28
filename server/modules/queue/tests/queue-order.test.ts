import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drag, lift, next, repair, view, type QueueOrderEntry } from '../queue-order.js';

const e = (key: string, kind: QueueOrderEntry['kind'], extra: Partial<QueueOrderEntry> = {}): QueueOrderEntry =>
  ({ key, kind, parentKey: null, blocks: [], state: 'none', since: 0, ...extra });

// Family R: root R, side quest S under R, blocker B blocking R. Unrelated roots X and Y.
const fam = [
  e('R', 'quest'),
  e('S', 'sidequest', { parentKey: 'R' }),
  e('B', 'blocker', { parentKey: 'R', blocks: ['R'] }),
  e('X', 'quest'),
  e('Y', 'chat'),
];

test('a consistent order stays as it is', () => {
  assert.deepEqual(repair(['X', 'B', 'R', 'Y', 'S'], fam), ['X', 'B', 'R', 'Y', 'S']);
});

test('a blocker below what it blocks moves above it; a side quest above its parent moves below it', () => {
  assert.deepEqual(repair(['R', 'B', 'X', 'Y', 'S'], fam), ['B', 'R', 'X', 'Y', 'S']);
  assert.deepEqual(repair(['B', 'S', 'R', 'X', 'Y'], fam), ['B', 'R', 'S', 'X', 'Y']);
});

test('closed entries drop out, new roots go last, a new blocker goes right above, a new side quest below its family', () => {
  assert.deepEqual(repair(['X', 'R', 'gone'], [e('X', 'quest'), e('R', 'quest'), e('Y', 'chat')]), ['X', 'R', 'Y']);
  assert.deepEqual(repair(['X', 'R', 'Y'], [e('X', 'quest'), e('R', 'quest'), e('Y', 'chat'), e('B', 'blocker', { parentKey: 'R', blocks: ['R'] })]),
    ['X', 'B', 'R', 'Y']);
  assert.deepEqual(repair(['R', 'X'], [e('R', 'quest'), e('X', 'quest'), e('S', 'sidequest', { parentKey: 'R' })]), ['R', 'S', 'X']);
});

test('a quest with a parent is a root and goes last', () => {
  assert.deepEqual(repair(['R', 'X'], [e('R', 'quest'), e('X', 'quest'), e('Q', 'quest', { parentKey: 'R' })]), ['R', 'X', 'Q']);
});

test('side quests of one parent sort by kind of wait inside their slots, then age', () => {
  const sq = [e('R', 'quest'), e('X', 'quest'),
    e('S1', 'sidequest', { parentKey: 'R', state: 'done', since: 1 }),
    e('S2', 'sidequest', { parentKey: 'R', state: 'question', since: 5 })];
  assert.deepEqual(repair(['R', 'S1', 'X', 'S2'], sq), ['R', 'S2', 'X', 'S1']);
});

test('dragging a root below its side quest carries the side quest; above its blocker carries the blocker', () => {
  const list = ['B', 'R', 'S', 'X', 'Y'];
  assert.deepEqual(drag(list, fam, 'R', 'Y'), ['B', 'X', 'R', 'S', 'Y']); // B stays: it is still above R
  assert.deepEqual(drag(['X', 'B', 'R', 'S', 'Y'], fam, 'R', 'X'), ['B', 'R', 'X', 'S', 'Y']);
  assert.deepEqual(drag(list, fam, 'X', null), ['B', 'R', 'S', 'Y', 'X']);
});

test('the view puts the pinned entry first, above the permission prompts; nothing else moves for it', () => {
  const v = [e('A', 'quest'), e('C', 'chat', { state: 'permission' }), e('D', 'chat')];
  assert.deepEqual(view(['A', 'D', 'C'], null, v), ['C', 'A', 'D']);
  assert.deepEqual(view(['A', 'D', 'C'], 'D', v), ['D', 'C', 'A']);
  assert.deepEqual(view(['B', 'R', 'S', 'X', 'Y'], 'S', fam), ['S', 'B', 'R', 'X', 'Y']);
  assert.deepEqual(view(['X', 'Y', 'B', 'R', 'S'], 'R', fam), ['R', 'X', 'Y', 'B', 'S']);
});

test('entries with a chat rank above tickets no chat has claimed, whatever their kind', () => {
  // R is a claimed quest, B its unclaimed blocker, S its claimed side quest, U an unclaimed root.
  const c = [
    e('R', 'quest', { state: 'running' }),
    e('B', 'blocker', { parentKey: 'R', blocks: ['R'], state: 'unclaimed' }),
    e('S', 'sidequest', { parentKey: 'R', state: 'done' }),
    e('U', 'quest', { state: 'unclaimed' }),
    e('P', 'chat', { state: 'permission' }),
  ];
  assert.deepEqual(view(['U', 'B', 'R', 'S', 'P'], null, c), ['P', 'R', 'S', 'U', 'B']);
  // Pinned side quest: first, even above its parent and the permission prompt; the rest stays as it was.
  assert.deepEqual(view(['U', 'B', 'R', 'S', 'P'], 'S', c), ['S', 'P', 'R', 'U', 'B']);
});

test('chats open right now form the first level; the pinned entry is first whatever its level', () => {
  const o = [e('A', 'quest', { state: 'running' }), e('B', 'chat', { open: true }), e('U', 'quest', { state: 'unclaimed' }),
    e('C', 'chat', { open: true }), e('P', 'chat', { state: 'permission', open: true })];
  assert.deepEqual(view(['A', 'B', 'U', 'C', 'P'], null, o), ['P', 'B', 'C', 'A', 'U']);
  assert.deepEqual(view(['A', 'B', 'U', 'C', 'P'], 'C', o), ['C', 'P', 'B', 'A', 'U']);
  assert.deepEqual(view(['A', 'B', 'U', 'C', 'P'], 'U', o), ['U', 'P', 'B', 'C', 'A']);
});

test('sync from Cursor lifts the given keys to the top in their order, each with its family block', () => {
  assert.deepEqual(lift(['A', 'B', 'C', 'U'], [e('A', 'chat'), e('B', 'chat'), e('C', 'chat'), e('U', 'chat')], ['C', 'A']),
    ['C', 'A', 'B', 'U']);
  assert.deepEqual(lift(['X', 'B', 'R', 'S', 'Y'], fam, ['R', 'gone']), ['B', 'R', 'X', 'S', 'Y']);
});

test('next skips the shown entry and entries that do not need Noam', () => {
  const n = [e('A', 'quest', { state: 'running' }), e('B2', 'quest', { state: 'question' }), e('C', 'chat', { state: 'done' })];
  assert.equal(next(['A', 'B2', 'C'], n, null), 'B2');
  assert.equal(next(['A', 'B2', 'C'], n, 'B2'), 'C');
  assert.equal(next(['A'], n, null), null);
});
