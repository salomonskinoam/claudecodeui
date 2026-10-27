import { setLeftTabs } from '@/shared/hooks/useSplitPane';
import { currentQueue, setQueueLatch, syncQueueFromCursor } from '@/modules/queue/queueStore';
import { entryOfChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: moving between chats.
 *   openNextInQueue   "bring me the next one in line": the highest entry that needs the user, other than the shown one
 *   noteShownChat     called whenever the left pane shows another chat; a chat left without a message, by a switch
 *                     made by hand (a line, a tab, a node; never by "next", a sync or a split), takes the "on top latch"
 *   noteSentInChat    called on every message sent from the page
 *   syncTabsFromCursor  the chats open in Cursor go on top of the queue and become the left pane's tabs
 * A chat open in another editor is answered there, so leaving it never sets the latch.
 */
let opener: ((entry: QueueEntry) => void) | null = null;
let shown: string | null = null;
let sentSinceShown = false;
let keepsPlace = false;

/** The list registers how an entry is opened (it holds the router). */
export const setQueueOpener = (open: (entry: QueueEntry) => void) => { opener = open; };

export const noteSentInChat = () => { sentSinceShown = true; };

/** The next switch is not one made by hand (next, sync, split): leaving the shown chat does not latch it. */
export const noteSwitchKeepsPlace = () => { keepsPlace = true; };

/** Open an entry by hand (a node of the forest): the same as clicking its line. */
export const openQueueEntry = (entry: QueueEntry) => opener?.(entry);

export function noteShownChat(sessionId: string | null): void {
  if (sessionId === shown) return;
  const left = shown;
  const leftQuietly = !sentSinceShown && !keepsPlace;
  shown = sessionId;
  sentSinceShown = false;
  keepsPlace = false;
  if (!left || !leftQuietly) return;
  const entry = entryOfChat(currentQueue().entries, left);
  if (entry && !entry.heldOutside) void setQueueLatch(entry.key).catch((error: unknown) => console.error(error));
}

export async function syncTabsFromCursor(): Promise<void> {
  const ids = await syncQueueFromCursor();
  const first = entryOfChat(currentQueue().entries, ids[0] ?? null);
  if (!first || !opener) return;
  if (first.sessionId !== shown) noteSwitchKeepsPlace();
  opener(first);
  setLeftTabs(ids);
}

export function openNextInQueue(): boolean {
  const { entries, view } = currentQueue();
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const current = entryOfChat(entries, shown)?.key ?? null;
  const key = view.find((k) => k !== current && byKey.get(k)?.needsNoam);
  if (!key || !opener) return false;
  noteSwitchKeepsPlace();
  opener(byKey.get(key)!);
  return true;
}
