import { setLeftTabs } from '@/shared/hooks/useSplitPane';
import { currentQueue, syncQueueFromCursor } from '@/modules/queue/queueStore';
import { currentShownChat } from '@/modules/queue/shownChat';
import { entryOfChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: moving between chats.
 *   openQueueEntry      open an entry as its line does (the list registers how, since it holds the router)
 *   startTicket         "Claim this ticket" on a ticket's page: a new chat for it (the list registers how, since
 *                       it holds the new-chat action)
 *   openNextInQueue     "bring me the next one in line": the highest entry that waits for the user, other than
 *                       the shown one; tickets no chat has claimed are skipped
 *   syncTabsFromCursor  the chats open in Cursor go on top of the queue and become the left pane's tabs
 */
let opener: ((entry: QueueEntry) => void) | null = null;
let starter: ((entry: QueueEntry) => void) | null = null;

export const setQueueOpener = (open: (entry: QueueEntry) => void) => { opener = open; };
export const setTicketStarter = (start: (entry: QueueEntry) => void) => { starter = start; };

export const openQueueEntry = (entry: QueueEntry) => opener?.(entry);
export const startTicket = (entry: QueueEntry) => starter?.(entry);

export async function syncTabsFromCursor(): Promise<void> {
  const ids = await syncQueueFromCursor();
  const first = entryOfChat(currentQueue().entries, ids[0] ?? null);
  if (!first || !opener) return;
  opener(first);
  setLeftTabs(ids);
}

export function openNextInQueue(): boolean {
  const { entries, view } = currentQueue();
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const current = entryOfChat(entries, currentShownChat())?.key ?? null;
  const key = view.find((k) => k !== current && byKey.get(k)?.waitsForMe);
  if (!key || !opener) return false;
  opener(byKey.get(key)!);
  return true;
}
