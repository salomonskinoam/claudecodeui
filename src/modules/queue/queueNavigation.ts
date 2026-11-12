import { useSyncExternalStore } from 'react';

import { isChatUnseen, markUnseenOnceHidden } from '@/shared/hooks/useLiveChats';
import { setLeftTabs } from '@/shared/hooks/useSplitPane';
import { currentQueue, syncQueueFromCursor } from '@/modules/queue/queueStore';
import { currentShownChat, useShownChat } from '@/modules/queue/shownChat';
import { blinkAgain, isBlinking } from '@/modules/queue/useBlink';
import { entryOfChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: moving between chats.
 *   openQueueEntry      open an entry as its line does (the list registers how, since it holds the router)
 *   openNextInQueue     "bring me the next one in line": the highest entry that waits for the user, other than
 *                       the shown one; tickets no chat has claimed are skipped
 *   goBack              the undo of "Next": back to the chat "Next" left, and the chat "Next" opened gets its seen
 *                       state back (its orange dot and its blink, if it had them). Each "Next" is one step; a step
 *                       counts only while its chat is the shown one (Noam, 3 Nov: "it's basically an undo button
 *                       for next")
 *   syncTabsFromCursor  the chats open in Cursor go on top of the queue and become the left pane's tabs
 */
let opener: ((entry: QueueEntry) => void) | null = null;

export const setQueueOpener = (open: (entry: QueueEntry) => void) => { opener = open; };

export const openQueueEntry = (entry: QueueEntry) => opener?.(entry);

export async function syncTabsFromCursor(): Promise<void> {
  const ids = await syncQueueFromCursor();
  const first = entryOfChat(currentQueue().entries, ids[0] ?? null);
  if (!first || !opener) return;
  opener(first);
  setLeftTabs(ids);
}

type Step = { from: QueueEntry; to: QueueEntry; unseen: boolean; blinking: boolean };
const steps: Step[] = [];
const stepListeners = new Set<() => void>();
const changed = () => stepListeners.forEach((l) => l());

/** `quiet`: when nothing waits, answer false with no popup (closing a tab falls back to its neighbor). */
export function openNextInQueue(quiet = false): boolean {
  const { entries, view } = currentQueue();
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const from = entryOfChat(entries, currentShownChat());
  const key = view.find((k) => k !== from?.key && byKey.get(k)?.waitsForMe);
  if (!opener) return false;
  if (!key) {
    if (quiet) return false;
    // Noam, 9 Nov: "maybe because there is nothing up next. in that case there should be a popup saying so, with one OK option."
    window.alert('Nothing is up next: no other chat waits for you.');
    return false;
  }
  const to = byKey.get(key)!;
  if (from?.sessionId && to.sessionId) {
    steps.push({ from, to, unseen: isChatUnseen(to.sessionId), blinking: isBlinking(to.key) });
    changed();
  }
  opener(to);
  return true;
}

const backStep = (shown: string | null): Step | undefined => {
  const top = steps.at(-1);
  return top && shown !== null && top.to.sessionId === shown ? top : undefined;
};

export function goBack(): void {
  const step = backStep(currentShownChat());
  if (!step || !opener) return;
  steps.pop();
  changed();
  if (step.unseen) markUnseenOnceHidden(step.to.sessionId!);
  if (step.blinking) blinkAgain(step.to.key);
  opener(step.from);
}

const subscribeSteps = (l: () => void) => { stepListeners.add(l); return () => { stepListeners.delete(l); }; };

/** True while the shown chat is one "Next" opened, so "Back" has somewhere to go. */
export function useCanGoBack(): boolean {
  const shown = useShownChat();
  useSyncExternalStore(subscribeSteps, () => steps.length);
  return Boolean(backStep(shown));
}
