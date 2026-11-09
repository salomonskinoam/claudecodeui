import { useSyncExternalStore } from 'react';

import { authenticatedFetch } from '@/shared/api';

/**
 * quests: one status dot per chat, the same on the tabs and in the sidebar.
 *   waiting  blue    a prompt waits on the user
 *   running  green   the chat is working
 *   workers  purple  the chat itself is idle, its workers (agents, background commands) run
 *   done     orange  it stopped while out of view, and has not been shown since
 * No dot: idle and already seen.
 * Live states come from GET /api/quests/live (every chat on this machine: Cursor, terminal and this page),
 * polled every two seconds, in the main page and in the split-screen pane (whose approval banner needs it).
 */
export type ChatDot = 'waiting' | 'running' | 'workers' | 'done' | 'listener' | 'listenerSilent' | 'hung';

// Blue and orange are the Claude Code extension's own tab dots (resources/claude-logo-pending.svg,
// claude-logo-done.svg); green is its timeline "success" dot.
// Pink and red come from the chat manager's check (server/modules/chat-hosts/reconcile.ts): pink is far from every
// other dot (Noam, 9 Nov: "listener silent should have a listener circle ... but with a \"?\" inside").
export const CHAT_DOT_STYLE: Record<ChatDot, { color: string; label: string; glyph?: string; pulse?: boolean }> = {
  waiting: { color: '#3B82F6', label: 'Waiting for you' },
  running: { color: '#74c991', label: 'Running', pulse: true },
  // The purple of the agent boxes in the chat (Noam, 6 Nov: "the same purple agent boxes in chat have makes sense here").
  workers: { color: '#a855f7', label: 'Its workers run; the chat itself is idle', pulse: true },
  done: { color: '#D97757', label: 'Finished, not seen yet' },
  listener: { color: '#ec4899', label: 'A listener waits for something outside; it wakes the chat when it ends' },
  listenerSilent: { color: '#ec4899', label: 'A listener runs, but its log has been silent for 2 hours', glyph: '?' },
  hung: { color: '#ef4444', label: 'May be hung, or its process keeps dying: needs you', glyph: '!' },
};

type LiveState = 'running' | 'waiting' | 'workers' | 'listener' | 'listenerSilent' | 'hung';
// The states in which the chat itself works; a chat that leaves them while out of view becomes unseen.
const WORKING: ReadonlySet<string> = new Set(['running', 'waiting', 'workers', 'hung']);

let live: Record<string, LiveState> = {};
const unseen = new Set<string>();
// Chats to mark unseen again as soon as they are off screen ("Back" undoes the seen that "Next" caused).
const unseeOnHide = new Set<string>();
let inView: string[] = [];
let snapshot: Record<string, ChatDot> = {};
const listeners = new Set<() => void>();
// Called when a chat starts, stops or asks: the queue reads itself again at once, so the two never disagree.
const liveChanged = new Set<() => void>();
let timer: number | null = null;

function publish(): void {
  const next: Record<string, ChatDot> = { ...live };
  // A turn that ended unseen shows orange, over a listener's pink, never over a chat that works.
  unseen.forEach((id) => {
    if (!WORKING.has(next[id])) next[id] = 'done';
  });
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function poll(force = false): Promise<void> {
  const response = await authenticatedFetch('/api/quests/live');
  if (!response.ok) {
    return;
  }
  const next: Record<string, LiveState> = await response.json();
  // A chat that stops while out of view becomes unseen.
  Object.keys(live).forEach((id) => {
    if (WORKING.has(live[id]) && !WORKING.has(next[id]) && !inView.includes(id)) {
      unseen.add(id);
    }
  });
  const changed = JSON.stringify(next) !== JSON.stringify(live);
  live = next;
  publish();
  if (changed || force) liveChanged.forEach((f) => f());
}

/** Runs `f` whenever a chat's live state changes (running, waiting, idle). */
export function onLiveChange(f: () => void): () => void {
  liveChanged.add(f);
  return () => liveChanged.delete(f);
}

/** Reads the live states now, not at the next tick (a message was just sent). */
export const pollChatDotsNow = (): void => void poll();

/**
 * quests: the server says a chat started, stopped, asked, got or lost a listener, or changed its closing line
 * (`quests_live_changed` on the chat socket): the dots and the queue read again at once.
 */
export const questsChanged = (): void => void poll(true);

/** The chats on screen right now (each pane's active tab). Showing a chat marks it seen. */
export function setChatsInView(ids: Array<string | null | undefined>): void {
  inView = ids.filter((id): id is string => Boolean(id));
  inView.forEach((id) => unseen.delete(id));
  unseeOnHide.forEach((id) => {
    if (!inView.includes(id)) {
      unseen.add(id);
      unseeOnHide.delete(id);
    }
  });
  publish();
}

export const isChatUnseen = (id: string): boolean => unseen.has(id);

/** Mark a chat unseen again (orange) once it is off screen: "Back" puts back what "Next" changed. */
export function markUnseenOnceHidden(id: string): void {
  unseeOnHide.add(id);
  setChatsInView(inView);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    void poll();
    // A backup only: changes arrive as `quests_live_changed` events.
    timer = window.setInterval(() => void poll(), 10_000);
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
