import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveClaims } from '../entries.js';

const claim = (sid: string, at: number) => ({ name: sid, sid, at });

test('a chat that holds a ticket has that ticket, though it also claimed another that a newer chat holds', () => {
  // Chat "old" claimed 17, then 63; its fork "fork" claimed 63 later and holds it. "old" must be 17's line only.
  const tickets = [
    { number: 17, parent: null, claims: [claim('old', 1)] },
    { number: 63, parent: null, claims: [claim('old', 2), claim('fork', 3)] },
  ];
  const { claimant, ticketOf } = resolveClaims(tickets, () => false);
  assert.equal(claimant.get(17), 'old');
  assert.equal(claimant.get(63), 'fork');
  assert.equal(ticketOf.get('old'), 17);
  assert.equal(ticketOf.get('fork'), 63);
});

test('a chat that would hold two tickets keeps the one it claimed first', () => {
  const tickets = [
    { number: 5, parent: null, claims: [claim('a', 2)] },
    { number: 6, parent: null, claims: [claim('a', 1)] },
  ];
  const { claimant, ticketOf } = resolveClaims(tickets, () => false);
  assert.equal(claimant.get(6), 'a');
  assert.equal(claimant.has(5), false);
  assert.equal(ticketOf.get('a'), 6);
});
