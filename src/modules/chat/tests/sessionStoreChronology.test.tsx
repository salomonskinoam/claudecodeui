import assert from 'node:assert/strict';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import type { NormalizedMessage } from '@/shared/types';

/**
 * quests: chronological order, always (Noam, 2 Nov: "it can never be the case that i type something, press enter,
 * and it's not the last thing i see in that second. also anything that chronologically came after has to be
 * printed after"; "make tests for that so it doesn't get fucked"). The store's merged list is what the pane
 * draws, in order; these tests pin its order through sends and history refreshes.
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
// A row typed on this page carries a local_ id: that is what the store retires once the transcript holds the echo.
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
const assertChronological = (messages: NormalizedMessage[]) => {
  for (let i = 1; i < messages.length; i += 1) {
    assert.ok(Date.parse(messages[i - 1].timestamp) <= Date.parse(messages[i].timestamp), `row ${i} ("${messages[i].content}") is older than the row before it`);
  }
};

describe('chronological order of the transcript', () => {
  it('a message typed now is the last row at once', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('local_1', 'user', 'executive summary and are we done', 10));
    });
    const messages = result.current.getMessages('session-1');
    assert.equal(messages.at(-1)?.content, 'executive summary and are we done');
    assertChronological(messages);
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
    assertChronological(messages);
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
    assertChronological(messages);
  });

  it('rows that came earlier are never drawn after a later row, whatever arrived first', async () => {
    const { result } = await loadedStore();
    // A reply streamed live, then an older report row delivered late by a refresh.
    act(() => {
      result.current.appendRealtime('session-1', row('live-1', 'assistant', 'live reply', 20));
    });
    serve([...HISTORY, row('h5', 'assistant', 'a report that happened before the reply', 18)]);
    await act(async () => {
      await result.current.refreshLatestFromServer('session-1', { limit: 20 });
    });
    const messages = result.current.getMessages('session-1');
    assert.deepEqual(texts(messages).slice(-2), ['a report that happened before the reply', 'live reply']);
    assertChronological(messages);
  });

  it('two messages typed in a row stay in the order typed', async () => {
    const { result } = await loadedStore();
    act(() => {
      result.current.appendRealtime('session-1', row('local_1', 'user', 'wait for instructions', 10));
      result.current.appendRealtime('session-1', row('local_2', 'user', 'where bro', 12));
    });
    const messages = result.current.getMessages('session-1');
    assert.deepEqual(texts(messages).slice(-2), ['wait for instructions', 'where bro']);
    assertChronological(messages);
  });
});
