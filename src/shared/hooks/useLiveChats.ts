import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';

/** quests: a chat's live state; a chat that is idle is absent. */
export type LiveState = 'running' | 'waiting';

/**
 * quests: the live state of every chat (Cursor, terminal and this page), polled from GET /api/quests/live
 * every two seconds. Drives the tab dots.
 */
export function useLiveChats(enabled: boolean): Record<string, LiveState> {
  const [states, setStates] = useState<Record<string, LiveState>>({});

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let stopped = false;
    const poll = async () => {
      const response = await authenticatedFetch('/api/quests/live');
      if (response.ok && !stopped) {
        setStates(await response.json());
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return states;
}
