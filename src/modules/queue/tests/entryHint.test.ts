import { describe, expect, it } from 'vitest';

import { entryHint } from '@/modules/queue/entryHint';
import type { QueueEntry } from '@/modules/queue/types';

const entry = (over: Partial<QueueEntry>): QueueEntry => ({
  kind: 'chat', sessionId: 's', state: 'none', waitsForMe: false, live: true, placement: 'queue', closingLine: null, marks: [], ...over,
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

  it('says when the chat itself is idle and its workers run', () => {
    expect(entryHint(entry({ state: 'waiting', closingLine: 'waiting for the agents' }), 'workers'))
      .toBe('Its workers run. Waits for something else, not you: the agents');
  });

  it('says when a waiting chat has no process and no listener to wake it', () => {
    expect(entryHint(entry({ state: 'waiting', live: false, waitsForMe: true, closingLine: 'waiting for the debug run' }), undefined))
      .toBe('Waits for something else, not you: the debug run. No process and no listener: nothing will wake it');
    expect(entryHint(entry({ state: 'waiting', live: false, closingLine: 'waiting for the debug run', marks: ['listener'] }), 'listener'))
      .toBe('Waits for something else, not you: the debug run. A listener runs and will wake it');
  });

  it("names what the manager's check found", () => {
    expect(entryHint(entry({ state: 'waiting', live: false, closingLine: 'waiting for the eval', marks: ['listenerSilent'] }), 'listenerSilent'))
      .toBe('Waits for something else, not you: the eval. A listener runs, but its log has been silent for 2 hours');
    expect(entryHint(entry({ state: 'running', waitsForMe: true, marks: ['hung'] }), 'hung'))
      .toBe('Running. May be hung: no output for 30 minutes and no worker running');
    expect(entryHint(entry({ state: 'waiting', live: false, waitsForMe: true, closingLine: 'waiting for the eval', marks: ['listenerEnded'] }), undefined))
      .toBe('Waits for something else, not you: the eval. No process and no listener: nothing will wake it. A listener ended, and the chat (open in Cursor) has not seen it');
  });
});
