import { useSyncExternalStore } from 'react';

import { useQueue } from '@/modules/queue/queueStore';
import { useShownChat } from '@/modules/queue/shownChat';
import { isChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: what the list shows. Two modes.
 *   focus    the default: only the chats that wait for Noam, plus the chat on screen; below them two collapsed
 *            lines, "Live chats (n)" (every chat with a process, whatever its state) and "Tickets-Unclaimed (n)"
 *   archive  everything, as the stored order has it, in its three groups
 * Noam, 28 Oct: "the philosophy is to filter for the user only chats that require attention. the rest is spam."
 * The mode is a per-viewer convenience kept in the browser.
 */
export type QueueMode = 'focus' | 'archive';

const STORE = 'quests-queue-mode';
let mode: QueueMode = (() => {
  try {
    return localStorage.getItem(STORE) === 'archive' ? 'archive' : 'focus';
  } catch {
    return 'focus';
  }
})();
const listeners = new Set<() => void>();

export function setQueueMode(next: QueueMode): void {
  mode = next;
  try {
    localStorage.setItem(STORE, next);
  } catch {
    /* no storage: the mode holds for this page load only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useQueueMode = (): QueueMode => useSyncExternalStore(subscribe, () => mode);

export type QueueView = {
  mode: QueueMode;
  /** The flat lines, in queue order. */
  lines: QueueEntry[];
  /** Focus mode: the two collapsed groups (empty in archive mode, where their members are among the lines). */
  live: QueueEntry[];
  unclaimed: QueueEntry[];
};

export function useQueueView(): QueueView {
  const queue = useQueue();
  const current = useQueueMode();
  const shown = useShownChat();
  const byKey = new Map(queue.entries.map((e) => [e.key, e]));
  const all = queue.view.map((k) => byKey.get(k)).filter((e): e is QueueEntry => Boolean(e));
  if (current === 'archive') return { mode: current, lines: all, live: [], unclaimed: [] };
  return {
    mode: current,
    lines: all.filter((e) => e.waitsForMe || isChat(e, shown)),
    live: all.filter((e) => e.live),
    unclaimed: all.filter((e) => e.state === 'unclaimed'),
  };
}
