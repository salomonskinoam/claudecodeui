import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';
import {
  appendLive, appendLocal, appendRead, appendStreamDelta, createLedger, cut, dropBlobRows, dropStreamTwins, endStream, markUndelivered, mergeLedgers, setOpen,
  type Ledger,
} from '@/modules/chat/ledger/chatLedger';

/**
 * quests: the chat view as a ledger (requirement 52), one case per anomaly Noam saw. Rows never move, never
 * disappear, never draw twice; what was drawn folded or open stays so.
 */

const T0 = Date.parse('2026-11-03T04:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const row = (id: string, role: 'user' | 'assistant', content: string, seconds: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage =>
  ({ id, kind: 'text', role, provider: 'claude', sessionId: 's1', content, timestamp: at(seconds), ...extra }) as NormalizedMessage;
const local = (n: number, content: string, seconds: number) => row(`local_${n}`, 'user', content, seconds);
const report = (id: string, seconds: number) => row(id, 'user', '<task-notification>\n<status>completed</status>\n<summary>Monitor event</summary>\n</task-notification>', seconds);
const STATE = 'Running: 6 runs.\nRequired from you: nothing.\nwaiting for the runs.';

const latest = (l: Ledger, page: NormalizedMessage[], seconds: number, extra: Partial<Parameters<typeof appendRead>[2]> = {}) =>
  appendRead(l, page, { direction: 'latest', epoch: l.epoch, batch: false, now: T0 + seconds * 1000, ...extra });
const older = (l: Ledger, page: NormalizedMessage[], seconds: number) =>
  appendRead(l, page, { direction: 'older', epoch: l.epoch, batch: true, now: T0 + seconds * 1000 });
const texts = (l: Ledger) => l.rows.map((r) => r.content);
const ids = (l: Ledger) => l.rows.map((r) => r.id);

const HISTORY = [row('h1', 'user', 'first prompt', 1), row('h2', 'assistant', 'first answer', 2), row('h3', 'user', 'second prompt', 3), row('h4', 'assistant', 'second answer', 4)];
const loaded = () => { const l = createLedger('s1'); latest(l, HISTORY, 5, { batch: true }); return l; };

test('1. a typed message confirmed by its copy is one row, where it was typed; a replayed echo adds nothing', () => {
  const l = loaded();
  appendLocal(l, local(1, 'executive summary and are we done', 10), T0 + 10_000);
  assert.equal(l.rows.at(-1)?.delivery, 'pending');
  // The transcript holds the copy now, stamped a second later, plus the reply.
  latest(l, [...HISTORY, row('h5', 'user', 'executive summary and are we done', 11), row('h6', 'assistant', 'This chat had one job.', 15)], 16);
  assert.deepEqual(texts(l).slice(-2), ['executive summary and are we done', 'This chat had one job.']);
  assert.equal(l.rows.filter((r) => r.content === 'executive summary and are we done').length, 1);
  assert.equal(l.rows.at(-2)?.id, 'local_1', 'the row keeps the id it was drawn with');
  assert.equal(l.rows.at(-2)?.delivery, undefined);
  assert.equal(l.alias.h5, 'local_1');
  // The same echo pushed again (a replay stamped now) is known by its id: nothing changes.
  assert.equal(appendLocal(l, local(1, 'executive summary and are we done', 60), T0 + 60_000), false);
  assert.equal(l.rows.length, 6);
});

test('2. a message the transcript never confirms is "not delivered" after a minute, stays drawn, and a late copy still confirms it', () => {
  const l = loaded();
  appendLocal(l, local(1, 'where bro', 10), T0 + 10_000);
  assert.equal(markUndelivered(l, T0 + 50_000), false);
  assert.equal(markUndelivered(l, T0 + 71_000), true);
  assert.equal(l.rows.at(-1)?.delivery, 'failed');
  assert.equal(l.rows.length, 5);
  // Five minutes later the CLI wrote it (it was queued behind a long tool call).
  latest(l, [...HISTORY, row('h5', 'user', 'where bro', 300)], 301);
  assert.equal(l.rows.length, 5);
  assert.equal(l.rows.at(-1)?.delivery, undefined);
  assert.equal(l.rows.at(-1)?.id, 'local_1');
});

test('3. a row the page sees late lands at the end; the rows drawn before it keep their place', () => {
  const l = loaded();
  appendLive(l, row('live-1', 'assistant', 'live reply', 20), T0 + 20_000);
  const before = ids(l);
  // A report stamped before the reply, delivered by a later read.
  latest(l, [...HISTORY, row('h5', 'assistant', 'a report that happened before the reply', 18), row('live-1', 'assistant', 'live reply', 20)], 21);
  assert.deepEqual(ids(l).slice(0, before.length), before);
  assert.deepEqual(texts(l).slice(-2), ['live reply', 'a report that happened before the reply']);
  assert.deepEqual(l.rows.map((r) => r.pos), [1, 2, 3, 4, 5, 6]);
});

test('4. a repeated reply folds at append; a third joins the fold; a typed message between prevents it', () => {
  const l = loaded();
  const live = (m: NormalizedMessage, s: number) => appendLive(l, m, T0 + s * 1000);
  live(report('r1', 20), 20); live(row('a1', 'assistant', `rag completed.\n${STATE}`, 21), 21);
  live(report('r2', 30), 30); live(row('a2', 'assistant', `restarted the watcher.\n${STATE}`, 31), 31);
  live(report('r3', 40), 40); live(row('a3', 'assistant', `rag graded.\n${STATE}`, 41), 41);
  const byId = (id: string) => l.rows.find((r) => r.id === id);
  assert.equal(byId('a1')?.foldId, undefined, 'the first reply of the run was drawn and stays');
  assert.equal(byId('a2')?.foldId, 'a2');
  assert.equal(byId('a3')?.foldId, 'a2');
  assert.equal(byId('r2')?.foldId, undefined, 'the report line was drawn before its reply came');
  // Noam types: the run ends; the next report's reply does not fold even with the same state.
  appendLocal(l, local(1, 'thanks', 50), T0 + 50_000);
  live(row('a4', 'assistant', `ok.\n${STATE}`, 51), 51);
  live(report('r5', 60), 60); live(row('a5', 'assistant', `again.\n${STATE}`, 61), 61);
  live(report('r6', 70), 70); live(row('a6', 'assistant', `and again.\n${STATE}`, 71), 71);
  assert.equal(byId('a4')?.foldId, undefined);
  assert.equal(byId('a5')?.foldId, undefined, 'the first reply of the new run shows');
  assert.equal(byId('a6')?.foldId, 'a6', 'the repeat folds');
});

test('5. an interrupt note ends the run like a typed message', () => {
  const l = loaded();
  const live = (m: NormalizedMessage, s: number) => appendLive(l, m, T0 + s * 1000);
  live(report('r1', 20), 20); live(row('a1', 'assistant', `a.\n${STATE}`, 21), 21);
  live(report('r2', 30), 30); live(row('a2', 'assistant', `b.\n${STATE}`, 31), 31);
  live(row('i1', 'user', '[Request interrupted by user]', 35), 35);
  live(report('r3', 40), 40); live(row('a3', 'assistant', `c.\n${STATE}`, 41), 41);
  assert.equal(l.rows.find((r) => r.id === 'a2')?.foldId, 'a2');
  assert.equal(l.rows.find((r) => r.id === 'a3')?.foldId, undefined);
});

test('6. a reload mid-run: the persisted ledger, the latest read and a full replay give no duplicate and the same order', () => {
  const l = loaded();
  appendLocal(l, local(1, 'go', 10), T0 + 10_000);
  appendLive(l, row('u1', 'user', 'go', 11), T0 + 11_000);
  appendLive(l, row('t1', 'assistant', '', 12, { kind: 'tool_use', toolId: 'toolu_1', toolName: 'Bash', toolInput: { command: 'ls' } }), T0 + 12_000);
  const persisted: Ledger = JSON.parse(JSON.stringify(l));
  const expected = ids(persisted);
  // The page comes back: the latest read, then the run replayed from its start.
  latest(persisted, [...HISTORY, row('u1', 'user', 'go', 11), row('t1', 'assistant', '', 12, { kind: 'tool_use', toolId: 'toolu_1', toolName: 'Bash', toolInput: { command: 'ls' } })], 13);
  appendLive(persisted, row('u1', 'user', 'go', 11), T0 + 13_000);
  appendLive(persisted, row('t1', 'assistant', '', 12, { kind: 'tool_use', toolId: 'toolu_1', toolName: 'Bash', toolInput: { command: 'ls' } }), T0 + 13_000);
  appendLive(persisted, row('a1', 'assistant', 'done', 14), T0 + 14_000);
  assert.deepEqual(ids(persisted), [...expected, 'a1']);
});

test('7. two windows on one chat: the stored order stands and the other window\'s rows follow', () => {
  const a = loaded();
  const b: Ledger = JSON.parse(JSON.stringify(a));
  appendLive(a, row('x1', 'assistant', 'seen by a', 20), T0 + 20_000);
  appendLive(b, row('x2', 'assistant', 'seen by b', 21), T0 + 21_000);
  setOpen(b, 'x2', true);
  const merged = mergeLedgers(a, b);
  assert.deepEqual(ids(merged), [...ids(a), 'x2']);
  assert.deepEqual(merged.open, { x2: true });
  assert.equal(merged.alias.x1, 'x1');
});

test('8. older history goes before the first row as a block; rows in common are skipped; the body is untouched', () => {
  const l = loaded();
  appendLive(l, row('x1', 'assistant', 'new', 20), T0 + 20_000);
  const body = ids(l);
  const page = [row('h-1', 'user', 'older prompt', -3), row('h0', 'assistant', 'older answer', -2), HISTORY[0], HISTORY[1]];
  const result = older(l, page, 21);
  assert.equal(result.prepended, 2);
  assert.deepEqual(ids(l), ['h-1', 'h0', ...body]);
  assert.deepEqual(l.rows.slice(0, 2).map((r) => r.pos), [-2, -1]);
});

test('9. an edit marks the replaced rows superseded, keeps the replacement, and drops a read from before the cut', () => {
  const l = createLedger('s1');
  latest(l, [row('h1', 'user', 'first prompt', 1, { transcriptAnchorId: 'u1' }), row('h2', 'assistant', 'first answer', 2), row('h3', 'user', 'second prompt', 3, { transcriptAnchorId: 'u2' }), row('h4', 'assistant', 'second answer', 4)], 5, { batch: true });
  const epochBefore = l.epoch;
  appendLocal(l, row('local_1', 'user', 'second prompt, edited', 10, { replacesAnchorId: 'u2' }), T0 + 10_000);
  assert.equal(cut(l, 'u2'), true);
  assert.deepEqual(l.rows.map((r) => Boolean(r.superseded)), [false, false, true, true, false]);
  assert.equal(l.rows.length, 5, 'nothing is removed');
  // A read requested before the cut lands after it: dropped.
  const stale = appendRead(l, [row('h9', 'assistant', 'from before the cut', 6)], { direction: 'latest', epoch: epochBefore, batch: false, now: T0 + 11_000 });
  assert.equal(stale.stale, true);
  assert.equal(l.rows.length, 5);
});

test('10. a streamed reply is one row that grows; its transcript copy confirms it', () => {
  const l = loaded();
  appendStreamDelta(l, 'This ', 'cursor', T0 + 20_000);
  appendStreamDelta(l, 'This chat', 'cursor', T0 + 20_500);
  assert.equal(l.rows.filter((r) => r.kind === 'stream_delta').length, 1);
  endStream(l, T0 + 21_000);
  const streamed = l.rows.at(-1)!;
  assert.equal(streamed.kind, 'text');
  latest(l, [...HISTORY, row('c1', 'assistant', 'This chat', 21)], 22);
  assert.equal(l.rows.length, 5);
  assert.equal(l.alias.c1, streamed.id);
});

test('11. a background row that arrives while a reply streams lands when the stream ends', () => {
  const l = loaded();
  appendStreamDelta(l, 'writing', 'cursor', T0 + 20_000);
  appendLive(l, report('r1', 21), T0 + 21_000);
  assert.equal(l.rows.some((r) => r.id === 'r1'), false);
  assert.equal(l.queued.length, 1);
  endStream(l, T0 + 22_000);
  assert.deepEqual(ids(l).slice(-2).map((id) => id.startsWith('__stream') ? 'stream' : id), ['stream', 'r1']);
});

test('12. a copy that would change a row\'s kind is refused', () => {
  const l = loaded();
  const result = latest(l, [...HISTORY.slice(0, 3), row('h4', 'assistant', '', 4, { kind: 'tool_use', toolId: 'toolu_9', toolName: 'Bash' })], 6);
  assert.equal(result.changed, false);
  assert.equal(l.rows[3].kind, 'text');
});

test('13. a batch folds by the page rule, and rows already drawn never fold', () => {
  const l = createLedger('s1');
  const page = [
    row('t0', 'user', 'watch the runs', 0), row('t1', 'assistant', `started.\n${STATE}`, 1),
    report('t2', 2), row('t4', 'assistant', `rag completed.\n${STATE}`, 4),
    report('t5', 5), row('t6', 'assistant', `restarted.\n${STATE}`, 6),
    report('t7', 7), row('t8', 'assistant', `graded.\n${STATE}`, 8),
  ];
  latest(l, page, 9, { batch: true });
  const foldOf = (id: string) => l.rows.find((r) => r.id === id)?.foldId;
  assert.equal(foldOf('t1'), undefined);
  assert.equal(foldOf('t2'), 't4'); assert.equal(foldOf('t4'), 't4'); assert.equal(foldOf('t5'), 't4'); assert.equal(foldOf('t6'), 't4');
  assert.equal(foldOf('t8'), undefined, 'the run\'s last reply shows');
  // Older history landing later: its own batch; what is drawn stays as drawn.
  const drawn = l.rows.map((r) => [r.id, r.foldId]);
  older(l, [report('o1', -5), row('o2', 'assistant', `old.\n${STATE}`, -4), page[0], page[1]], 10);
  assert.deepEqual(l.rows.slice(2).map((r) => [r.id, r.foldId]), drawn);
});

test('14. a latest read with no row in common changes nothing until bridged, then lands after a gap note', () => {
  const l = loaded();
  const far = [row('z1', 'user', 'much later', 900), row('z2', 'assistant', 'answer', 901)];
  const first = latest(l, far, 902);
  assert.equal(first.overlapped, false);
  assert.equal(l.rows.length, 4);
  const bridged = latest(l, far, 903, { bridge: true, batch: true });
  assert.equal(bridged.appended, 3);
  assert.equal(l.rows[4].noteKind, 'gap');
  assert.deepEqual(ids(l).slice(-2), ['z1', 'z2']);
});

test('15. a live tool call and its later transcript copy are one row, paired by tool id', () => {
  const l = loaded();
  appendLive(l, row('live-t', 'assistant', '', 20, { kind: 'tool_use', toolId: 'toolu_7', toolName: 'Read', toolInput: { file_path: 'a' } }), T0 + 20_000);
  latest(l, [...HISTORY, row('h7', 'assistant', '', 20, { kind: 'tool_use', toolId: 'toolu_7', toolName: 'Read', toolInput: { file_path: 'a' } })], 21);
  assert.equal(l.rows.filter((r) => r.kind === 'tool_use').length, 1);
  assert.equal(l.alias.h7, 'live-t');
});

test('16. a whole reply landing while its pieces still stream confirms the streamed row; an old twin is dropped at load', () => {
  // The reply arrives while the streamed row still holds a prefix: the reply confirms it, one row.
  const l = loaded();
  appendStreamDelta(l, 'This ', 'claude', T0 + 20_000);
  appendLive(l, row('c1', 'assistant', 'This chat', 21), T0 + 21_000);
  endStream(l, T0 + 21_500);
  assert.equal(l.rows.filter((r) => r.content === 'This chat').length, 1);
  assert.equal(l.rows.at(-1)!.kind, 'text');
  assert.equal(l.alias.c1, l.rows.at(-1)!.id);
  // A ledger saved by the bug (the reply first, the streamed row created after it): the twin goes at load, the
  // reply stays, and a confirmed streamed row elsewhere is never touched.
  const bad = loaded();
  appendLive(bad, row('c2', 'assistant', 'Short reply', 30), T0 + 30_000);
  appendStreamDelta(bad, 'Short reply', 'claude', T0 + 30_100);
  endStream(bad, T0 + 30_200);
  appendStreamDelta(bad, 'Another', 'claude', T0 + 31_000);
  endStream(bad, T0 + 31_100);
  appendLive(bad, row('c3', 'assistant', 'Another', 31), T0 + 31_200);
  assert.equal(bad.rows.filter((r) => r.content === 'Short reply').length, 2);
  assert.equal(dropStreamTwins(bad), true);
  assert.deepEqual(texts(bad).slice(-2), ['Short reply', 'Another']);
  assert.equal(bad.rows.at(-2)!.id, 'c2');
  assert.equal(dropStreamTwins(bad), false);
});

test('17: at load, the user rows the server once made from api-request-blob records are dropped; typed rows with the CLI uuid stay', () => {
  const l = createLedger('s');
  appendRead(l, [
    row('14e50811-9b92-4a4a-b365-30da8ad0b540_text_0', 'user', 'create a ticket', 0),
    row('b1', 'assistant', 'Done.', 1),
    row('claude_05a6e225-a7a5-4dec-bb46-615695062d8a_text_2', 'user', 'create a ticket', 100),
    row('claude_4be44b5a-9fcb-4853-b123-9d15b3a3c454_text_1', 'user', 'Tool loaded.', 100),
    row('claude_4be44b5a-9fcb-4853-b123-9d15b3a3c454_text_3', 'assistant', 'An assistant row without a uuid stays', 101),
  ], { direction: 'latest', epoch: 0, batch: true, now: T0 });
  assert.equal(dropBlobRows(l), true);
  assert.deepEqual(texts(l), ['create a ticket', 'Done.', 'An assistant row without a uuid stays']);
  assert.equal(l.alias['claude_05a6e225-a7a5-4dec-bb46-615695062d8a_text_2'], undefined);
  assert.equal(dropBlobRows(l), false);
});

test('a latest page after a long absence is not taken for a rewrite: its tool calls never take old rows\' places', () => {
  // 9 Nov: the page last saw this chat on 6 Nov. The latest page had no id in common, and every Bash call of it
  // matched an old Bash row by kind and tool name (a tool call has no words), so the read counted as overlapped:
  // three days were never drawn and old rows got today's calls.
  const tool = (id: string, command: string, seconds: number) =>
    ({ id, kind: 'tool_use', provider: 'claude', sessionId: 's1', toolName: 'Bash', toolId: `t_${id}`, toolInput: { command }, timestamp: at(seconds) }) as NormalizedMessage;
  const l = createLedger('s1');
  latest(l, [row('h1', 'user', 'old prompt', 1), tool('b1', 'ls', 2), tool('b2', 'git push -q', 3), row('h2', 'assistant', 'old answer', 4)], 5, { batch: true });
  const before = JSON.stringify(l.rows);
  const page = [row('n1', 'user', 'new prompt', 100), tool('n2', 'npm run build', 101), tool('n3', 'git push -q', 102), row('n4', 'assistant', 'new answer', 103)];
  const result = latest(l, page, 104);
  assert.equal(result.overlapped, false, 'the caller must bridge');
  assert.equal(JSON.stringify(l.rows), before, 'no old row changed');
  // The bridge then draws the page after a gap note.
  latest(l, page, 105, { batch: true, bridge: true });
  assert.deepEqual(l.rows.slice(-4).map((r) => r.timestamp), page.map((m) => m.timestamp));
});
