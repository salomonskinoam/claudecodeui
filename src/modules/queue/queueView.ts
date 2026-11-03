import { useSyncExternalStore } from 'react';

import { useQueue } from '@/modules/queue/queueStore';
import { useShownChat } from '@/modules/queue/shownChat';
import { isChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: what the list shows. Five drawers, each entry in exactly one, in this order:
 *   Pending chats      what needs Noam: a permission prompt, a question, a Done he has not approved; plus the
 *                      chat on screen. The only drawer open by default.
 *   Active chats       every other chat with a process. The ones running come last: "they require no
 *                      attention by definition" (Noam, 3 Nov). Idle ones first, each half in queue order.
 *   On hold            the chats Noam put on hold, until they reply again.
 *   Tickets-Unclaimed  the tickets no chat claimed, in the order Noam drags.
 *   Archived           what Noam archived, whatever it does.
 * Noam, 28 Oct: "the philosophy is to filter for the user only chats that require attention. the rest is spam."
 * The "archive" mode (everything flat, as the stored order has it) has no button since 3 Nov; the headless
 * checks set it in the browser's storage.
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
  /** The Pending chats drawer (in archive mode: every entry, flat), in queue order. */
  lines: QueueEntry[];
  /** The other drawers (empty in archive mode, where their members are among the lines). */
  active: QueueEntry[];
  hold: QueueEntry[];
  unclaimed: QueueEntry[];
  /** Both modes: the entries Noam archived, in queue order. */
  archived: QueueEntry[];
};

export function useQueueView(): QueueView {
  const queue = useQueue();
  const current = useQueueMode();
  const shown = useShownChat();
  const byKey = new Map(queue.entries.map((e) => [e.key, e]));
  const every = queue.view.map((k) => byKey.get(k)).filter((e): e is QueueEntry => Boolean(e));
  const archived = every.filter((e) => e.archived);
  const all = every.filter((e) => !e.archived);
  if (current === 'archive') return { mode: current, lines: all, active: [], hold: [], unclaimed: [], archived };
  // Noam, 3 Nov: "i want that section to keep chats i may want to go back to on my own". Its place in the
  // queue is kept; its next reply takes it out of the group.
  const hold = all.filter((e) => e.dismissed);
  const rest = all.filter((e) => !e.dismissed);
  // The chat on screen stays listed, unless its reply was dismissed: then it leaves the list and the forest
  // while its tab stays open (Noam, 2 Nov: "the chat tab is open, should remain open and leave the queue").
  const lines = rest.filter((e) => e.waitsForMe || isChat(e, shown));
  const open = rest.filter((e) => e.live && !lines.includes(e));
  return {
    mode: current,
    lines,
    active: [...open.filter((e) => e.state !== 'running'), ...open.filter((e) => e.state === 'running')],
    hold,
    unclaimed: rest.filter((e) => e.state === 'unclaimed'),
    archived,
  };
}
