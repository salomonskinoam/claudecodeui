import { useSyncExternalStore } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { isEmbedded } from '@/shared/hooks/useSplitPane';
import type { Queue, TicketGroup, Where } from '@/modules/queue/types';

/**
 * quests priority queue: the page's copy of the queue. Polled every two seconds by the main page (the split-screen
 * iframe does not poll), and replaced by the answer of every call that changes it. The order itself is computed by
 * the server (server/modules/queue/queue-order.ts).
 */

const POLL_MS = 2000;
const EMPTY: Queue = { entries: [], order: [], latch: null, view: [], ticketGroups: [] };

let queue: Queue = EMPTY;
const listeners = new Set<() => void>();
let timer: number | null = null;

// Requests can answer out of order (a slow poll after a drop): only an answer to a request sent after the one
// shown may replace the queue, so an older state never flashes back.
let sent = 0;
let shownSeq = 0;

async function request(method: string, route: string, body?: unknown): Promise<unknown> {
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
    listeners.forEach((l) => l());
  }
  return json.data;
}

// The chats open as tabs in this window (page session ids, in tab order) join the queue. Every poll reports them,
// so a restarted server knows them again within two seconds; two windows each report under their own id.
const windowId = crypto.randomUUID();
let openTabs: string[] | null = null;
const refresh = () => (openTabs ? request('PUT', '/tabs', { windowId, sessionIds: openTabs }) : request('GET', ''));

export function reportPageTabs(sessionIds: string[]): void {
  if (openTabs?.join() === sessionIds.join()) return;
  openTabs = sessionIds;
  void refresh().catch((error: unknown) => console.error(error));
}

export const dragQueue = (key: string, beforeKey: string | null) => request('PUT', '/drag', { key, beforeKey });
export const setQueueLatch = (key: string | null) => request('PUT', '/latch', { key });
/** The pause icon: put the entry's chat on hold until it replies again. */
/** The pause icon: on hold until the chat replies again; `false` takes it off hold now. */
/** Noam's groups of unclaimed tickets: the whole list. */
export const setTicketGroups = (groups: TicketGroup[]) => request('PUT', '/groups', { groups });
/** A drawer button: the entry goes to the end of the queue, to "On hold" or to "Archived". Not a toggle. */
export const placeQueueEntry = (key: string, where: Where) => request('PUT', '/place', { key, where });
export const closeQueueTicket = (number: number, choice: string) => request('POST', '/close', { number, choice });
/** Puts the chats open in Cursor on top; answers their page session ids, in Cursor's tab order. */
export const syncQueueFromCursor = async (): Promise<string[]> =>
  ((await request('POST', '/sync-cursor', {})) as { cursorSessionIds: string[] }).cursorSessionIds;

/** The current queue, without subscribing (for key handlers). */
export const currentQueue = () => queue;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null && !isEmbedded) {
    const poll = () => void refresh().catch((error: unknown) => console.error(error));
    poll();
    timer = window.setInterval(poll, POLL_MS);
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

// The queue's names by page session id (entries.ts `title`, the one name of a chat), for the tabs. A new object
// only when a name changes, so a poll that changes nothing re-renders nothing.
let namesKey = '';
let names: Record<string, string> = {};
function namesSnapshot(): Record<string, string> {
  const next: Record<string, string> = {};
  for (const e of queue.entries) if (e.sessionId) next[e.sessionId] = e.title;
  const key = JSON.stringify(next);
  if (key !== namesKey) {
    namesKey = key;
    names = next;
  }
  return names;
}
export const useQueueNames = (): Record<string, string> => useSyncExternalStore(subscribe, namesSnapshot);

// The folder each ticket's chat starts in (entries.ts `startFolder`), by ticket number, for the ticket tabs.
let foldersKey = '';
let folders: Record<number, string> = {};
function foldersSnapshot(): Record<number, string> {
  const next: Record<number, string> = {};
  for (const e of queue.entries) if (e.number !== null && e.startFolder) next[e.number] = e.startFolder;
  const key = JSON.stringify(next);
  if (key !== foldersKey) {
    foldersKey = key;
    folders = next;
  }
  return folders;
}
export const useTicketFolders = (): Record<number, string> => useSyncExternalStore(subscribe, foldersSnapshot);

/** A chat started from a ticket's tab: the queue counts it as the ticket's at once, before its claim reaches GitHub. */
export const claimTicketForChat = (number: number, sessionId: string) => request('POST', '/claim', { number, sessionId });

/**
 * A chat's turn just ended (the page heard it): the server reads that chat's transcript and the live processes
 * now, and the queue comes back with it. The finish sound waits for this, so the sound and the queue's change
 * come together (Noam, 6 Nov: "the beep has to be together with an update of the queue after the state change").
 */
export const settleQueue = (sessionId: string) => request('POST', '/settle', { sessionId });
