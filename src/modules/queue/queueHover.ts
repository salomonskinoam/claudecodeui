import { useSyncExternalStore } from 'react';

import { currentQueue } from '@/modules/queue/queueStore';

/**
 * quests priority queue: the entry under the mouse, one key shared by the list, the forest and the tab rows, so
 * the three light up together and look the same. Any of them sets it; all of them read it.
 */

/** The look of the hovered entry, the same in all three places. */
export const HOVER_CLASS = 'brightness-150 ring-1 ring-inset ring-white/80';

let hover: string | null = null;
const listeners = new Set<() => void>();

export function setQueueHover(key: string | null): void {
  if (hover === key) return;
  hover = key;
  listeners.forEach((l) => l());
}

/** The same, from a chat's page session id (a tab). */
export function hoverQueueSession(sessionId: string | null): void {
  setQueueHover(sessionId ? currentQueue().entries.find((e) => e.sessionId === sessionId)?.key ?? null : null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useQueueHover = (): string | null => useSyncExternalStore(subscribe, () => hover);
