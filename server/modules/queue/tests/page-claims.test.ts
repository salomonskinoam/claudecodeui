import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveClaims } from '../entries.js';
import { notePageClaim, pageClaims } from '../page-claims.js';

test('a chat started from a ticket tab claims it at once, and the claim lapses after 30 minutes', () => {
  notePageClaim(42, 'page-id', 1_000);
  assert.deepEqual(pageClaims(2_000).get(42), { sessionId: 'page-id', at: 1_000 });
  // Merged as a claim, it makes the chat the ticket's holder.
  const { claimant } = resolveClaims([{ number: 42, claims: [{ name: 'page', sid: 'claude-id', at: 1_000 }] }], () => false);
  assert.equal(claimant.get(42), 'claude-id');
  assert.equal(pageClaims(1_000 + 31 * 60_000).has(42), false);
});
