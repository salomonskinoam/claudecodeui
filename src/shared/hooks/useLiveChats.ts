import { useSyncExternalStore } from 'react';

import { authenticatedFetch } from '@/shared/api';

/**
 * quests: one status dot per chat, the same on the tabs and in the sidebar.
 *   waiting  blue    a prompt waits on the user
 *   running  green   the chat is working
 *   done     orange  it stopped while out of view, and has not been shown since
 * No dot: idle and already seen.
 * Live states come from GET /api/quests/live (every chat on this machine: Cursor, terminal and this page),
 * polled every two seconds, in the main page and in the split-screen pane (whose approval banner needs it).
 */
export type ChatDot = 'waiting' | 'running' | 'done';

// Blue and orange are the Claude Code extension's own tab dots (resources/claude-logo-pending.svg,
// claude-logo-done.svg); green is its timeline "success" dot.
export const CHAT_DOT_STYLE: Record<ChatDot, { color: string; label: string }> = {
  waiting: { color: '#3B82F6', label: 'Waiting for you' },
  running: { color: '#74c991', label: 'Running' },
  done: { color: '#D97757', label: 'Finished, not seen yet' },
};

type LiveState = 'running' | 'waiting';

let live: Record<string, LiveState> = {};
const unseen = new Set<string>();
let inView: string[] = [];
let snapshot: Record<string, ChatDot> = {};
const listeners = new Set<() => void>();
let timer: number | null = null;

function publish(): void {
  const next: Record<string, ChatDot> = {};
  unseen.forEach((id) => {
    next[id] = 'done';
  });
  Object.assign(next, live);
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function poll(): Promise<void> {
  const response = await authenticatedFetch('/api/quests/live');
  if (!response.ok) {
    return;
  }
  const next: Record<string, LiveState> = await response.json();
  // A chat that stops while out of view becomes unseen.
  Object.keys(live).forEach((id) => {
    if (!next[id] && !inView.includes(id)) {
      unseen.add(id);
    }
  });
  live = next;
  publish();
}

/** The chats on screen right now (each pane's active tab). Showing a chat marks it seen. */
export function setChatsInView(ids: Array<string | null | undefined>): void {
  inView = ids.filter((id): id is string => Boolean(id));
  inView.forEach((id) => unseen.delete(id));
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    void poll();
    timer = window.setInterval(() => void poll(), 2000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useChatDots(): Record<string, ChatDot> {
  return useSyncExternalStore(subscribe, () => snapshot);
}
