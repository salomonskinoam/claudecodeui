import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildEntries } from '../entries.js';

// Built before the tickets have loaded, a chat that claimed a ticket shows as a chat of its own, without the place
// Noam gave its ticket, so old chats come back into the queue (12 Nov). Until every source loaded once, no queue.
test('the queue refuses to build until its sources have loaded', () => {
  assert.throws(() => buildEntries(), (e: { code?: string }) => e.code === 'QUEUE_LOADING');
});
