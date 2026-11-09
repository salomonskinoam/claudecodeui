import { describe, expect, it, vi } from 'vitest';

/**
 * quests: the finish sound waits for the settle answer, so that answer must be what the queue shows. 9 Nov: a poll
 * sent while the settle ran answered first with the old state and won the order check, so the sound came with the
 * old queue and the change came up to 10 s later.
 */

const answers: Array<(body: unknown) => void> = [];
vi.mock('@/shared/api', () => ({
  authenticatedFetch: () => new Promise((resolve) => {
    answers.push((data) => resolve({ ok: true, json: async () => ({ data }) }));
  }),
}));
vi.mock('@/shared/hooks/useLiveChats', () => ({ onLiveChange: () => () => undefined }));
vi.mock('@/shared/hooks/useSplitPane', () => ({ isEmbedded: true }));

const state = (name: string) => ({ entries: [{ key: name }], order: [], latch: null, view: [name], ticketGroups: [] });

describe('settleQueue', () => {
  it('shows the settle answer even when a later poll answered first', async () => {
    const store = await import('@/modules/queue/queueStore');
    const settled = store.settleQueue('s1');
    const polled = store.dragQueue('x', null); // any request sent after the settle
    answers[1](state('old'));
    await polled;
    expect(store.currentQueue().view).toEqual(['old']);
    answers[0](state('fresh'));
    await settled;
    expect(store.currentQueue().view).toEqual(['fresh']);
  });
});
