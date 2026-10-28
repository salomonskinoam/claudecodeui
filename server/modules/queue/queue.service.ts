import { chatsIn } from '@/modules/queue/chats.js';
import { dismiss } from '@/modules/queue/dismissals.js';
import { buildEntries, type QueueEntry } from '@/modules/queue/entries.js';
import { readLatch, readOrder, writeLatch, writeOrder } from '@/modules/queue/order-store.js';
import { drag, lift, repair, view } from '@/modules/queue/queue-order.js';
import { setPageTabs } from '@/modules/queue/sources/page-tabs.js';
import { noteTranscriptOnce } from '@/modules/queue/sources/transcripts.js';

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

/** The trash icon: hides the entry's chat until it replies again (its current reply is recorded as dismissed). */
export function dismissEntry(key: string): Queue {
  const entry = buildEntries().find((e) => e.key === key);
  if (entry) dismiss(key, entry.replyAt ?? 'none');
  return getQueue();
}

/** A page window reports its tabs; a chat the queue never read gets its transcript read now, for its name and state. */
export function reportPageTabs(windowId: string, pageSessionIds: string[]): Queue {
  setPageTabs(windowId, pageSessionIds);
  for (const c of chatsIn('page')) if (c.transcriptPath) noteTranscriptOnce(c.sid, c.transcriptPath);
  return getQueue();
}

/**
 * "Sync from Cursor": the chats open in Cursor jump to the top, in Cursor's tab order, and the latch is released
 * so nothing sits above them. Answers their page session ids too: the page opens them as its tabs.
 */
export function syncFromCursor(): Queue & { cursorSessionIds: string[] } {
  const entries = buildEntries();
  const synced = chatsIn('cursor')
    .map((c) => entries.find((e) => e.providerSessionId === c.sid))
    .filter((e): e is QueueEntry => Boolean(e));
  writeOrder(lift(repair(readOrder(), entries), entries, synced.map((e) => e.key)));
  writeLatch(null);
  return { ...getQueue(), cursorSessionIds: synced.map((e) => e.sessionId).filter((id): id is string => Boolean(id)) };
}
