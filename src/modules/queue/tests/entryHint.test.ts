import { describe, expect, it } from 'vitest';

import { entryHint } from '@/modules/queue/entryHint';
import type { QueueEntry } from '@/modules/queue/types';

const entry = (over: Partial<QueueEntry>): QueueEntry => ({
  kind: 'chat', sessionId: 's', started: true, state: 'none', waitsForMe: false, live: true, placement: 'queue', closingLine: null, ...over,
}) as QueueEntry;

describe('entryHint', () => {
  it('tells a chat that waits for Noam from one whose turn ended unseen but waits for something else', () => {
    expect(entryHint(entry({ state: 'question', waitsForMe: true, closingLine: 'question build it?' }), 'done'))
      .toBe('Turn ended, not seen yet. Waits for you: a question (build it?)');
    expect(entryHint(entry({ state: 'waiting', closingLine: 'waiting for the restart of the service' }), 'done'))
      .toBe('Turn ended, not seen yet. Waits for something else, not you: the restart of the service');
    expect(entryHint(entry({ state: 'done', waitsForMe: true, closingLine: 'done the fix' }), undefined))
      .toBe('Waits for you: a Done to approve (the fix)');
  });

  it('names the permission prompt, a running chat, and a hold or archive', () => {
    expect(entryHint(entry({ state: 'permission', waitsForMe: true }), 'waiting')).toBe('Waits for you: a permission prompt');
    expect(entryHint(entry({ state: 'running' }), 'running')).toBe('Running');
    expect(entryHint(entry({ state: 'running', placement: 'hold' }), 'running')).toBe('On hold until its next activity. Running');
    expect(entryHint(entry({ state: 'none', live: false, placement: 'archive' }), undefined)).toBe('Archived until its next activity. No process');
  });

  it('says a chat Noam never wrote in is not started, whatever its last line', () => {
    expect(entryHint(entry({ state: 'done', started: false, closingLine: 'done read the notice' }), 'done'))
      .toBe('Turn ended, not seen yet. Not started: you have not written in it; it only ran on its own');
  });
});
