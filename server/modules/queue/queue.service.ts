import { buildEntries, type QueueEntry } from '@/modules/queue/entries.js';
import { readLatch, readOrder, writeLatch, writeOrder } from '@/modules/queue/order-store.js';
import { drag, lift, repair, view } from '@/modules/queue/queue-order.js';
import { getCursorTabs } from '@/modules/queue/sources/cursor-tabs.js';
import { getLive } from '@/modules/queue/sources/live.js';

/** quests priority queue: what the page asks of the queue. Each call answers with the whole queue. */

export type Queue = { entries: QueueEntry[]; order: string[]; latch: string | null; view: string[] };

export function getQueue(): Queue {
  const entries = buildEntries();
  const order = repair(readOrder(), entries);
  writeOrder(order);
  const stored = readLatch();
  const latch = stored && entries.some((e) => e.key === stored) ? stored : null;
  return { entries, order, latch, view: view(order, latch, entries) };
}

export function setOrder(order: string[]): Queue {
  writeOrder(repair(order, buildEntries()));
  return getQueue();
}

/** Drag `key` to stand before `beforeKey` (null: last); its family block comes along as the rules require. */
export function dragTo(key: string, beforeKey: string | null): Queue {
  const entries = buildEntries();
  writeOrder(drag(repair(readOrder(), entries), entries, key, beforeKey));
  return getQueue();
}

export function setLatch(key: string | null): Queue {
  writeLatch(key);
  return getQueue();
}

/**
 * "Sync from Cursor": the chats open in Cursor (its Claude tabs in tab order, then live Cursor chats) jump to the
 * top, and the latch is released so nothing sits above them. Answers their page session ids too: the page opens
 * them as its tabs.
 */
export function syncFromCursor(): Queue & { cursorSessionIds: string[] } {
  const entries = buildEntries();
  const cursor = [...getLive()].filter(([, p]) => p.entrypoint === 'claude-vscode').map(([sid]) => sid);
  const synced = [...new Set([...getCursorTabs(), ...cursor])]
    .map((sid) => entries.find((e) => e.providerSessionId === sid))
    .filter((e): e is QueueEntry => Boolean(e));
  writeOrder(lift(repair(readOrder(), entries), entries, synced.map((e) => e.key)));
  writeLatch(null);
  return { ...getQueue(), cursorSessionIds: synced.map((e) => e.sessionId).filter((id): id is string => Boolean(id)) };
}
