import { useSyncExternalStore } from 'react';

/**
 * quests priority queue: the chat on screen in the left pane (its page session id), one value every widget reads.
 * The workspace reports it. Nothing else follows from a switch: the pin is manual only (Noam, 28 Oct: "pin should
 * be only manual. auto pinning is confusing").
 */

let shown: string | null = null;
const listeners = new Set<() => void>();

export function noteShownChat(sessionId: string | null): void {
  if (sessionId === shown) return;
  shown = sessionId;
  listeners.forEach((l) => l());
}

export const currentShownChat = () => shown;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useShownChat = (): string | null => useSyncExternalStore(subscribe, () => shown);
