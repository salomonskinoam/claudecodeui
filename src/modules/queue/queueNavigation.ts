import { setLeftTabs } from '@/shared/hooks/useSplitPane';
import { currentQueue, syncQueueFromCursor } from '@/modules/queue/queueStore';
import { currentShownChat, noteSwitchKeepsPlace } from '@/modules/queue/shownChat';
import { entryOfChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: moving between chats.
 *   openQueueEntry      open an entry as its line does (the list registers how, since it holds the router and
 *                       the new-chat action for an unclaimed ticket)
 *   openNextInQueue     "bring me the next one in line": the highest entry that needs the user, other than the shown one
 *   syncTabsFromCursor  the chats open in Cursor go on top of the queue and become the left pane's tabs
 * Next and sync are not switches made by hand: the chat they leave keeps its place.
 */
let opener: ((entry: QueueEntry) => void) | null = null;

export const setQueueOpener = (open: (entry: QueueEntry) => void) => { opener = open; };

export const openQueueEntry = (entry: QueueEntry) => opener?.(entry);

export async function syncTabsFromCursor(): Promise<void> {
  const ids = await syncQueueFromCursor();
  const first = entryOfChat(currentQueue().entries, ids[0] ?? null);
  if (!first || !opener) return;
  if (first.sessionId !== currentShownChat()) noteSwitchKeepsPlace();
  opener(first);
  setLeftTabs(ids);
}

export function openNextInQueue(): boolean {
  const { entries, view } = currentQueue();
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const current = entryOfChat(entries, currentShownChat())?.key ?? null;
  const key = view.find((k) => k !== current && byKey.get(k)?.needsNoam);
  if (!key || !opener) return false;
  noteSwitchKeepsPlace();
  opener(byKey.get(key)!);
  return true;
}
