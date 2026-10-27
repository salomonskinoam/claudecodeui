import { setLeftTabs } from '@/shared/hooks/useSplitPane';
import { currentQueue, setQueueLatch, syncQueueFromCursor } from '@/modules/queue/useQueue';
import type { QueueEntry } from '@/modules/queue/useQueue';

/**
 * quests priority queue: moving between chats.
 *   openNextInQueue   "bring me the next one in line": the highest entry that needs the user, other than the shown one
 *   noteShownChat     called whenever the left pane shows another chat; a chat left without a message, by a switch
 *                     made by hand (a line, a tab, a node; never by "next"), takes the "on top latch"
 *   noteSentInChat    called on every message sent from the page
 * A chat open in another editor is answered there, so leaving it never sets the latch.
 */
let opener: ((entry: QueueEntry) => void) | null = null;
let shown: string | null = null;
let sentSinceShown = false;
let viaNext = false;

/** The list registers how an entry is opened (it holds the router). */
export const setQueueOpener = (open: (entry: QueueEntry) => void) => { opener = open; };

export const noteSentInChat = () => { sentSinceShown = true; };

/** Open an entry by hand (a node of the forest): the same as clicking its line. */
export const openQueueEntry = (entry: QueueEntry) => opener?.(entry);

export function noteShownChat(sessionId: string | null): void {
  if (sessionId === shown) return;
  const left = shown;
  const leftQuietly = !sentSinceShown && !viaNext;
  shown = sessionId;
  sentSinceShown = false;
  viaNext = false;
  if (!left || !leftQuietly) return;
  const entry = currentQueue().entries.find((e) => e.sessionId === left);
  if (entry && !entry.heldOutside) void setQueueLatch(entry.key).catch((error: unknown) => console.error(error));
}

/** "Sync from Cursor": the chats open in Cursor go on top of the queue and become the left pane's tabs. */
export async function syncTabsFromCursor(): Promise<void> {
  const ids = await syncQueueFromCursor();
  const first = currentQueue().entries.find((e) => e.sessionId === ids[0]);
  if (!first || !opener) return;
  if (first.sessionId !== shown) viaNext = true; // a sync is not a switch by hand: it never latches
  opener(first);
  setLeftTabs(ids);
}

export function openNextInQueue(): boolean {
  const { entries, view } = currentQueue();
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const current = entries.find((e) => e.sessionId === shown)?.key ?? null;
  const key = view.find((k) => k !== current && byKey.get(k)?.needsNoam);
  if (!key || !opener) return false;
  viaNext = true;
  opener(byKey.get(key)!);
  return true;
}
