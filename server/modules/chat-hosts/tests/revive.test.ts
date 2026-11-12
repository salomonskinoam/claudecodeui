import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deadChats } from '../revive.js';

const chat = (title: string, over: Partial<Parameters<typeof deadChats>[0][number]> = {}) => ({
  sessionId: title, title, placement: 'queue', state: 'waiting', live: false, marks: [] as string[], heldOutside: false, ...over,
});

test('revive goes to chats that wait with nothing running; Cursor chats are only listed', () => {
  const { send, outside } = deadChats([
    chat('dead'),
    chat('blocked', { state: 'blocker' }),
    chat('running', { live: true }),
    chat('listening', { marks: ['listener'] }),
    chat('asks Noam', { state: 'question' }),
    chat('on hold', { placement: 'hold' }),
    chat('ticket', { sessionId: null }),
    chat('in cursor', { heldOutside: true }),
  ]);
  assert.deepEqual(send.map((c) => c.title), ['dead', 'blocked']);
  assert.deepEqual(outside.map((c) => c.title), ['in cursor']);
});
