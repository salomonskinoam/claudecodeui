import { useSyncExternalStore } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { isEmbedded } from '@/shared/hooks/useSplitPane';

/**
 * quests priority queue: the queue from GET /api/quests/queue, polled every two seconds by the main page
 * (the split-screen iframe does not poll), plus the line or node under the mouse, shared by the list and
 * the forest widget. The order itself is computed by the server (server/modules/queue/queue-order.ts).
 */
export type QueueEntry = {
  key: string;
  kind: 'quest' | 'sidequest' | 'blocker' | 'chat';
  parentKey: string | null;
  blocks: string[];
  state: 'permission' | 'running' | 'question' | 'done' | 'waiting' | 'blocker' | 'unclaimed' | 'none';
  since: number;
  title: string;
  url: string | null;
  number: number | null;
  sessionId: string | null;
  providerSessionId: string | null;
  chatName: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  needsNoam: boolean;
  heldOutside: boolean;
  /** Open right now: a live Claude Code process, or a Claude tab in Cursor. The list draws a line under these. */
  open: boolean;
  closingLine: string | null;
  parentChatSid: string | null;
  openBlockers: number[];
  startFolder: string | null;
};

export type Queue = { entries: QueueEntry[]; order: string[]; latch: string | null; view: string[] };

const EMPTY: Queue = { entries: [], order: [], latch: null, view: [] };
let queue: Queue = EMPTY;
let hover: string | null = null;
const listeners = new Set<() => void>();
let timer: number | null = null;

const publish = () => listeners.forEach((l) => l());

// Requests can answer out of order (a slow poll after a drop): only an answer to a request sent after the one
// shown may replace the queue, so an older state never flashes back.
let sent = 0;
let shownSeq = 0;

async function call(method: string, route: string, body?: unknown): Promise<unknown> {
  const seq = ++sent;
  const response = await authenticatedFetch(`/api/quests/queue${route}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`queue ${method} ${route}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  if (json.data?.entries && seq > shownSeq) {
    shownSeq = seq;
    queue = json.data;
    publish();
  }
  return json.data;
}

let openTabs: string[] | null = null;
/** This window's id: two page windows each keep their own tabs in the queue. */
const windowId = crypto.randomUUID();
export const refreshQueue = () => (openTabs ? call('PUT', '/tabs', { windowId, sessionIds: openTabs }) : call('GET', ''));

export const dragQueue = (key: string, beforeKey: string | null) => call('PUT', '/drag', { key, beforeKey });
export const setQueueLatch = (key: string | null) => call('PUT', '/latch', { key });
export const closeQueueTicket = (number: number, choice: string) => call('POST', '/close', { number, choice });
/** Puts the chats open in Cursor on top; returns their page session ids, in Cursor's tab order. */
export const syncQueueFromCursor = async () =>
  ((await call('POST', '/sync-cursor', {})) as { cursorSessionIds: string[] }).cursorSessionIds;

/**
 * The chats open as tabs (page session ids, in tab order) join the queue. Every poll reports them,
 * so a restarted server knows them again within two seconds.
 */
export function reportQueueTabs(sessionIds: string[]): void {
  if (openTabs?.join() === sessionIds.join()) return;
  openTabs = sessionIds;
  void refreshQueue().catch((error: unknown) => console.error(error));
}

export async function postQueue<T>(route: string, body: unknown): Promise<T> {
  const response = await authenticatedFetch(`/api/quests/queue${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`queue POST ${route}: ${response.status} ${await response.text()}`);
  return (await response.json()).data as T;
}

export function setQueueHover(key: string | null): void {
  if (hover === key) return;
  hover = key;
  publish();
}

/** A tab under the mouse lights up its chat's line in the list and its node in the forest. */
export function hoverQueueSession(sessionId: string | null): void {
  setQueueHover(sessionId ? queue.entries.find((e) => e.sessionId === sessionId)?.key ?? null : null);
}

/** The current queue, without subscribing (for key handlers). */
export const currentQueue = () => queue;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null && !isEmbedded) {
    const poll = () => void refreshQueue().catch((error: unknown) => console.error(error));
    poll();
    timer = window.setInterval(poll, 2000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export const useQueue = (): Queue => useSyncExternalStore(subscribe, () => queue);
export const useQueueHover = (): string | null => useSyncExternalStore(subscribe, () => hover);

/** Ten dark colors far apart, ordered so each one differs strongly from the next. */
const PALETTE = ['#1f4e79', '#7a4a10', '#2d5a27', '#6b1f52', '#16585e', '#6b2020', '#5e5e14', '#2a3a8a', '#4b5260', '#4b2a6b'];

/**
 * One color per family, given in queue order: the first family down the list gets the first color, and so on. So
 * families next to each other never share a color; a color comes back only ten families further down.
 */
export function familyColors(queue: Queue): Map<string, string> {
  const rootOf = new Map(queue.entries.map((e) => [e.key, e.rootKey]));
  const out = new Map<string, string>();
  for (const root of [...queue.view.map((k) => rootOf.get(k)), ...rootOf.values()]) {
    if (root && !out.has(root)) out.set(root, PALETTE[out.size % PALETTE.length]);
  }
  return out;
}
