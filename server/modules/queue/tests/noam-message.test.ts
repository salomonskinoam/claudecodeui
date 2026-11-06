import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isNoamMessage } from '../sources/transcripts.js';

/** A chat is started once Noam wrote in it: typed in an editor (origin human) or sent from the page (no origin). */
test('only a message Noam wrote starts a chat', () => {
  const user = (extra: Record<string, unknown>, content: unknown = 'hello') => ({ type: 'user', message: { content }, ...extra });
  assert.equal(isNoamMessage(user({ origin: { kind: 'human' } })), true);
  assert.equal(isNoamMessage(user({ promptSource: 'sdk' })), true);
  assert.equal(isNoamMessage(user({ origin: { kind: 'peer' }, isMeta: true }, 'Another Claude session sent a message')), false);
  assert.equal(isNoamMessage(user({ origin: { kind: 'task-notification' } }, '<task-notification>')), false);
  assert.equal(isNoamMessage(user({ toolUseResult: {} }, [{ type: 'tool_result' }])), false);
  assert.equal(isNoamMessage(user({}, [{ type: 'tool_result' }])), false);
  assert.equal(isNoamMessage(user({ isCompactSummary: true })), false);
  assert.equal(isNoamMessage({ type: 'assistant', message: { content: 'x' } }), false);
});
