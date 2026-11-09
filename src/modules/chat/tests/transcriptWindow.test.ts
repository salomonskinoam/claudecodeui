import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';
import { placeLatest, placeOlder, settleNotes, view, type TranscriptWindow } from '@/modules/chat/transcript/transcriptWindow';

/**
 * quests: the page draws the transcript (requirement 52, Noam, 9 Nov: "there is a ssot. just display it"). Reads are
 * placed by transcript position; nothing is compared.
 */

const row = (n: number, role: 'user' | 'assistant' = 'assistant', content = `row ${n}`): NormalizedMessage =>
  ({ id: `r${n}`, kind: 'text', role, provider: 'claude', sessionId: 's1', content, timestamp: new Date(1e12 + n * 1000).toISOString() }) as NormalizedMessage;
const rows = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => row(from + i));
const ids = (w: TranscriptWindow | null) => w?.rows.map((m) => m.id);

test('a newest read that overlaps replaces the window from its first position on', () => {
  const w = { start: 10, rows: rows(10, 20) };
  const changed = { ...row(18), content: 'row 18 with its result' };
  const placed = placeLatest(w, [changed, ...rows(19, 25)], 25);
  assert.equal(placed?.start, 10);
  assert.deepEqual(ids(placed), rows(10, 25).map((m) => m.id));
  assert.equal(placed?.rows[8].content, 'row 18 with its result');
});

test('a newest read after a long absence does not reach the window: null, the caller reads more', () => {
  assert.equal(placeLatest({ start: 10, rows: rows(10, 20) }, rows(40, 50), 50), null);
});

test('an empty window, or a transcript that shrank, starts over from the read', () => {
  assert.deepEqual(placeLatest({ start: 0, rows: [] }, rows(40, 50), 50), { start: 40, rows: rows(40, 50) });
  assert.deepEqual(placeLatest({ start: 10, rows: rows(10, 20) }, rows(12, 15), 15), { start: 12, rows: rows(12, 15) });
});

test('an older page adds only the rows before the window, even when the transcript grew meanwhile', () => {
  const w = { start: 30, rows: rows(30, 40) };
  // Read at tail offset 10 of a transcript that grew from 40 to 42: the page is rows 22..31.
  const placed = placeOlder(w, rows(22, 32), 42, 10);
  assert.equal(placed.start, 22);
  assert.deepEqual(ids(placed), rows(22, 40).map((m) => m.id));
});

test('a typed message is drawn until the transcript has a typed row at or after where it was sent', () => {
  const typed = { ...row(99, 'user', 'hello'), id: 'local_1', delivery: 'pending' as const };
  const notes = [{ message: typed, at: 20 }];
  const before = { start: 10, rows: rows(10, 20) };
  assert.equal(settleNotes(before, notes).length, 1);
  const report = { start: 10, rows: [...rows(10, 20), row(20, 'user', '<task-notification>done</task-notification>')] };
  assert.equal(settleNotes(report, notes).length, 1, 'a report is not the typed message');
  const after = { start: 10, rows: [...rows(10, 20), row(20, 'user', 'hello')] };
  assert.equal(settleNotes(after, notes).length, 0);
  assert.deepEqual(view(before, notes, null).map((m) => m.id).slice(-2), ['r19', 'local_1']);
});

test('the streamed reply is drawn last; folds look back only', () => {
  const stream = { ...row(0), id: '__stream_s1', kind: 'stream_delta' } as NormalizedMessage;
  const report = (n: number) => row(n, 'user', '<task-notification>tick</task-notification>');
  const reply = (n: number) => row(n, 'assistant', 'Running: x\nRequired from you: nothing\nwaiting for x');
  const w = { start: 0, rows: [row(0, 'user', 'go'), reply(1), report(2), reply(3), report(4), reply(5)] };
  const drawn = view(w, [], stream);
  assert.equal(drawn.at(-1)?.id, '__stream_s1');
  // The first report turn shows; the next ones state the same and fold under one run.
  assert.deepEqual(drawn.slice(0, 6).map((m) => m.foldId ?? null), [null, null, null, null, 'r5', 'r5']);
});
