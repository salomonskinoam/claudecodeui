import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';

/**
 * quests: the store draws the ledger (requirement 52) and the order is the order of arrival (requirement 50,
 * Noam, 2 Nov: "it can never be the case that i type something, press enter, and it's not the last thing i
 * see in that second"; "make tests for that so it doesn't get fucked"). These tests pin what the store hands
 * the pane through sends and history refreshes; the ledger's own rules are pinned in chatLedger.test.ts.
 */

const sessionMessages = vi.fn();

vi.mock('@/shared/api', () => ({
  api: {
    providers: {
      sessionMessages: (...args: unknown[]) => sessionMessages(...args),
    },
  },
}));

const at = (second: number) => `2026-11-02T20:00:${String(second).padStart(2, '0')}.000Z`;
// A row typed on this page carries a local_ id: the ledger confirms it once the transcript holds the copy.
const row = (id: string, role: 'user' | 'assistant', content: string, second: number): NormalizedMessage => ({
  id,
  kind: 'text',
  role,
  provider: 'claude',
  sessionId: 'session-1',
  content,
  timestamp: at(second),
} as NormalizedMessage);

const HISTORY = [
  row('h1', 'user', 'first prompt', 1),
  row('h2', 'assistant', 'first answer', 2),
  row('h3', 'user', 'second prompt', 3),
  row('h4', 'assistant', 'second answer', 4),
];

const serve = (messages: NormalizedMessage[]) => {
  sessionMessages.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { messages, total: messages.length, hasMore: false } }),
  });
};

beforeEach(() => {
  sessionMessages.mockReset();
  serve(HISTORY);
});

afterEach(() => {
  vi.resetModules();
});

async function loadedStore() {
  const { useSessionStore } = await import('@/modules/chat/hooks/useSessionStore');
  const view = renderHook(() => useSessionStore());
  await act(async () => {
    await view.result.current.fetchFromServer('session-1', { limit: 20, offset: 0 });
  });
  return view;
}

const texts = (messages: NormalizedMessage[]) => messages.map((m) => m.content);

describe('the order the page draws', () => {
  it('a message typed now is the last row at once', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('local_1', 'user', 'executive summary and are we done', 10));
    });
    const messages = result.current.getMessages('session-1');
    assert.equal(messages.at(-1)?.content, 'executive summary and are we done');
    assert.equal(messages.at(-1)?.delivery, 'pending');
  });

  it('a history refresh that does not hold the typed message yet keeps it last', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('local_1', 'user', 'executive summary and are we done', 10));
    });
    serve(HISTORY);
    await act(async () => {
      await result.current.refreshLatestFromServer('session-1', { limit: 20 });
    });
    const messages = result.current.getMessages('session-1');
    assert.equal(messages.at(-1)?.content, 'executive summary and are we done');
    assert.equal(messages.length, 5);
  });

  it('a history refresh that holds the typed message shows it once, still last, and the reply after it', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('local_1', 'user', 'executive summary and are we done', 10));
    });
    serve([...HISTORY, row('h5', 'user', 'executive summary and are we done', 11), row('h6', 'assistant', 'This chat had one job.', 15)]);
    await act(async () => {
      await result.current.refreshLatestFromServer('session-1', { limit: 20 });
    });
    const messages = result.current.getMessages('session-1');
    assert.deepEqual(texts(messages).slice(-2), ['executive summary and are we done', 'This chat had one job.']);
    assert.equal(messages.filter((m) => m.content === 'executive summary and are we done').length, 1);
    assert.equal(messages.at(-2)?.id, 'local_1', 'the row drawn at Enter is the row that stays');
    assert.equal(messages.at(-2)?.delivery, undefined);
  });

  it('two messages typed in a row stay in the order typed', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('local_1', 'user', 'wait for instructions', 10));
      result.current.appendRealtime('session-1', row('local_2', 'user', 'where bro', 12));
    });
    const messages = result.current.getMessages('session-1');
    assert.deepEqual(texts(messages).slice(-2), ['wait for instructions', 'where bro']);
  });

  it('a refresh never moves or removes a drawn row; what it brings lands after', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('live-1', 'assistant', 'live reply', 20));
    });
    const before = result.current.getMessages('session-1').map((m) => m.id);
    serve([...HISTORY, row('h5', 'assistant', 'a report the page had not seen', 18), row('live-1', 'assistant', 'live reply', 20)]);
    await act(async () => {
      await result.current.refreshLatestFromServer('session-1', { limit: 20 });
    });
    const after = result.current.getMessages('session-1').map((m) => m.id);
    assert.deepEqual(after.slice(0, before.length), before);
    assert.deepEqual(after.slice(before.length), ['h5']);
  });

  it('an older page lands before the first row and leaves the rest as it was', async () => {
    const { result } = await loadedStore();
    const slot = result.current.getSessionSlot('session-1')!;
    slot.hasMore = true;
    const body = result.current.getMessages('session-1').map((m) => m.id);
    sessionMessages.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { messages: [row('h-1', 'user', 'older prompt', 0), row('h0', 'assistant', 'older answer', 0), HISTORY[0], HISTORY[1]], total: 6, hasMore: false } }),
    });
    await act(async () => {
      await result.current.fetchMore('session-1', { limit: 20 });
    });
    assert.deepEqual(result.current.getMessages('session-1').map((m) => m.id), ['h-1', 'h0', ...body]);
    assert.equal(result.current.getSessionSlot('session-1')?.hasMore, false);
  });
});
