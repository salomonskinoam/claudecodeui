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
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  needsNoam: boolean;
  heldOutside: boolean;
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

async function call(method: string, route: string, body?: unknown): Promise<void> {
  const response = await authenticatedFetch(`/api/quests/queue${route}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`queue ${method} ${route}: ${response.status} ${await response.text()}`);
  const json = await response.json();
  if (json.data?.entries) {
    queue = json.data;
    publish();
  }
}

export const refreshQueue = () => call('GET', '');

/** The view a drag of `key` to stand before `beforeKey` would give (nothing is stored). */
export async function previewQueue(key: string, beforeKey: string | null): Promise<string[]> {
  const q = new URLSearchParams({ key, before: beforeKey ?? '' });
  const response = await authenticatedFetch(`/api/quests/queue/preview?${q}`);
  if (!response.ok) throw new Error(`queue preview: ${response.status}`);
  return (await response.json()).data.view;
}
export const dragQueue = (key: string, beforeKey: string | null) => call('PUT', '/drag', { key, beforeKey });
export const setQueueLatch = (key: string | null) => call('PUT', '/latch', { key });
export const closeQueueTicket = (number: number, choice: string) => call('POST', '/close', { number, choice });

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

const fnv = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};

/**
 * One generated color per family. Each root gets a hue from a hash of its key; a hue closer than 14 degrees to
 * one already taken moves on by the golden angle until it is free. Roots are taken in key order, so the same set
 * of families always gets the same colors. Fixed saturation and lightness, for the dark theme.
 */
export function familyColors(rootKeys: string[]): Map<string, string> {
  const taken: number[] = [];
  const out = new Map<string, string>();
  for (const key of [...new Set(rootKeys)].sort()) {
    let hue = fnv(key) % 360;
    for (let tries = 0; tries < 25 && taken.some((t) => Math.min(Math.abs(t - hue), 360 - Math.abs(t - hue)) < 14); tries += 1) {
      hue = (hue + 137.5) % 360;
    }
    taken.push(hue);
    out.set(key, `hsl(${Math.round(hue)}, 35%, 22%)`);
  }
  return out;
}
