import { useSyncExternalStore } from 'react';

/**
 * quests priority queue: the entry under the mouse, one key shared by the list, the forest and the tab rows, so
 * the three light up together and look the same. Any of them sets it; all of them read it.
 */

let hover: string | null = null;
const listeners = new Set<() => void>();

export function setQueueHover(key: string | null): void {
  if (hover === key) return;
  hover = key;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useQueueHover = (): string | null => useSyncExternalStore(subscribe, () => hover);
