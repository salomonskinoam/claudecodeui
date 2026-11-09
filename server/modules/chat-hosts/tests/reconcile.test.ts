import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ChatHostRow, ListenerRow } from '@/modules/database/index.js';

import { HUNG_MS, SILENT_MS, decide, type Facts } from '../reconcile.js';

// quests: one case per row of the check's table (reconcile.ts), through decide() alone.

const NOW = Date.parse('2026-11-09T15:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function host(over: Partial<ChatHostRow> = {}): ChatHostRow {
  return { session_id: 'c1', unit: 'quests-chat-c1', build: 'b', pid: 1, started_at: iso(3600_000), turn_open: 0, turn_started_at: null, held: 0, last_event_at: iso(60_000), ended_at: null, wakes: '[]', ...over };
}
function listener(over: Partial<ListenerRow> = {}): ListenerRow {
  return { id: 'l1', session_id: 'claude-1', name: 'eval watch', command: 'x', unit: 'quests-listen-l1', log_path: '/nonexistent', started_at: iso(600_000), ended_at: null, exit_code: null, delivered_at: null, restarts: 0, ...over };
}
function facts(over: Partial<Facts> = {}): Facts {
  const chat = { sessionId: 'c1', placement: 'queue' as const, outside: false, activityAt: NOW - 3600_000 };
  return {
    now: NOW, hosts: [], activeUnits: new Set(), unanswering: new Set(), workers: new Set(), transcriptAt: new Map(), listeners: [],
    activeListenerUnits: new Set(), logChangedAt: new Map(), chats: new Map([['c1', chat], ['claude-1', chat]]), due: [], ...over,
  };
}
const kinds = (r: ReturnType<typeof decide>) => r.actions.map((a) => `${a.kind}:${'sessionId' in a ? a.sessionId : a.listenerId}`);
const lines = () => 'last line';

test('manager died, service alive: nothing to do', () => {
  assert.deepEqual(kinds(decide(facts({ hosts: [host({ turn_open: 1 })], activeUnits: new Set(['c1']) }), lines)), []);
});

test('service gone with a turn open or a held process: wake', () => {
  assert.deepEqual(kinds(decide(facts({ hosts: [host({ turn_open: 1 })] }), lines)), ['wake:c1']);
  assert.deepEqual(kinds(decide(facts({ hosts: [host({ held: 1 })] }), lines)), ['wake:c1']);
});

test('reboot: every open record with work is woken, idle ones are closed', () => {
  const r = decide(facts({ hosts: [host({ turn_open: 1 }), host({ session_id: 'c2' })] }), lines);
  assert.deepEqual(kinds(r), ['wake:c1', 'endHost:c2']);
});

test('a chat on hold or archived is not woken', () => {
  const chat = { sessionId: 'c1', placement: 'hold' as const, outside: false, activityAt: 0 };
  assert.deepEqual(kinds(decide(facts({ hosts: [host({ turn_open: 1 })], chats: new Map([['c1', chat]]) }), lines)), ['endHost:c1']);
});

test('three wakes in the last hour: no more wakes, keepsDying', () => {
  const r = decide(facts({ hosts: [host({ turn_open: 1, wakes: JSON.stringify([iso(50 * 60_000), iso(30 * 60_000), iso(10 * 60_000)]) })] }), lines);
  assert.deepEqual(kinds(r), []);
  assert.deepEqual(r.marks.c1, ['keepsDying']);
  const old = decide(facts({ hosts: [host({ turn_open: 1, wakes: JSON.stringify([iso(5 * 3600_000), iso(4 * 3600_000), iso(10 * 60_000)]) })] }), lines);
  assert.deepEqual(kinds(old), ['wake:c1']);
});

test('ended records are left alone', () => {
  assert.deepEqual(kinds(decide(facts({ hosts: [host({ turn_open: 1, ended_at: iso(1000) })] }), lines)), []);
});

test('hung: a turn open with no event past the limit and no worker; never an action', () => {
  const stale = host({ turn_open: 1, turn_started_at: iso(HUNG_MS + 120_000), last_event_at: iso(HUNG_MS + 60_000) });
  const r = decide(facts({ hosts: [stale], activeUnits: new Set(['c1']) }), lines);
  assert.deepEqual(r.marks.c1, ['hung']);
  assert.deepEqual(kinds(r), []);
  assert.equal(decide(facts({ hosts: [stale], activeUnits: new Set(['c1']), workers: new Set(['c1']) }), lines).marks.c1, undefined);
  assert.equal(decide(facts({ hosts: [stale], activeUnits: new Set(['c1']), transcriptAt: new Map([['c1', NOW - 1000]]) }), lines).marks.c1, undefined);
  assert.deepEqual(decide(facts({ hosts: [host()], activeUnits: new Set(['c1']), unanswering: new Set(['c1']) }), lines).marks.c1, ['hung']);
});

test('listener ended in a page chat: the chat gets the result', () => {
  const r = decide(facts({ listeners: [listener({ ended_at: iso(1000), exit_code: 3 })] }), lines);
  assert.deepEqual(kinds(r), ['listenerResult:c1']);
  const a = r.actions[0];
  assert.ok(a.kind === 'listenerResult' && a.text.includes('exit code 3') && a.text.includes('last line'));
});

test('listener ended in a Cursor chat: marked until the chat moves again', () => {
  const outside = { sessionId: 'c1', placement: 'queue' as const, outside: true, activityAt: NOW - 3600_000 };
  const ended = listener({ ended_at: iso(60_000), exit_code: 0 });
  const r = decide(facts({ listeners: [ended], chats: new Map([['claude-1', outside]]) }), lines);
  assert.deepEqual(kinds(r), []);
  assert.deepEqual(r.marks.c1, ['listenerEnded']);
  const moved = { ...outside, activityAt: NOW - 1000 };
  assert.deepEqual(kinds(decide(facts({ listeners: [ended], chats: new Map([['claude-1', moved]]) }), lines)), ['listenerSeen:l1']);
});

test('listener gone without an exit: started again, at most 5 times', () => {
  assert.deepEqual(kinds(decide(facts({ listeners: [listener()] }), lines)), ['restartListener:l1']);
  assert.deepEqual(kinds(decide(facts({ listeners: [listener({ restarts: 5 })] }), lines)), []);
});

test('listener running: pink, silent past the limit: silent', () => {
  const running = facts({ listeners: [listener()], activeListenerUnits: new Set(['l1']), logChangedAt: new Map([['l1', NOW - 1000]]) });
  assert.deepEqual(decide(running, lines).marks.c1, ['listener']);
  const silent = facts({ listeners: [listener()], activeListenerUnits: new Set(['l1']), logChangedAt: new Map([['l1', NOW - SILENT_MS - 1000]]) });
  assert.deepEqual(decide(silent, lines).marks.c1, ['listenerSilent']);
});

test('a message due for a chat with no service: start it', () => {
  assert.deepEqual(kinds(decide(facts({ due: ['c1', 'c1'] }), lines)), ['start:c1']);
  assert.deepEqual(kinds(decide(facts({ due: ['c1'], activeUnits: new Set(['c1']) }), lines)), []);
});
