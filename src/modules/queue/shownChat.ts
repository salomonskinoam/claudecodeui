import { useSyncExternalStore } from 'react';

import { currentQueue, setQueueLatch } from '@/modules/queue/queueStore';
import { entryOfChat } from '@/modules/queue/types';

/**
 * quests priority queue: the chat on screen in the left pane (its page session id), one value every widget reads,
 * and how it is left. A chat left without a message, by a switch made by hand (a line, a tab, a node; never by
 * "next", a sync or a split), takes the "on top latch". A chat open in another editor is answered there, so
 * leaving it never sets the latch.
 */

let shown: string | null = null;
let sentSinceShown = false;
let keepsPlace = false;
const listeners = new Set<() => void>();

/** The workspace reports the chat it shows (null: none). */
export function noteShownChat(sessionId: string | null): void {
  if (sessionId === shown) return;
  const left = shown;
  const leftQuietly = !sentSinceShown && !keepsPlace;
  shown = sessionId;
  sentSinceShown = false;
  keepsPlace = false;
  listeners.forEach((l) => l());
  if (!left || !leftQuietly) return;
  const entry = entryOfChat(currentQueue().entries, left);
  if (entry && !entry.heldOutside) void setQueueLatch(entry.key).catch((error: unknown) => console.error(error));
}

/** Called on every message sent from the page. */
export const noteSentInChat = () => { sentSinceShown = true; };

/** The next switch is not one made by hand (next, sync, split): leaving the shown chat does not latch it. */
export const noteSwitchKeepsPlace = () => { keepsPlace = true; };

export const currentShownChat = () => shown;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useShownChat = (): string | null => useSyncExternalStore(subscribe, () => shown);
