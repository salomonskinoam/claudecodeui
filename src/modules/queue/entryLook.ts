import { useFamilyColors } from '@/modules/queue/familyColors';
import { setQueueHover, useQueueHover } from '@/modules/queue/queueHover';
import { useQueue } from '@/modules/queue/queueStore';
import { useShownChat } from '@/modules/queue/shownChat';
import { entryOfChat, isChat, type QueueEntry, type QueueKind } from '@/modules/queue/types';

/**
 * quests priority queue: how an entry looks, the same on the list, the forest and the tabs. This module alone
 * joins the family color, the shown chat and the shared hover into one look; the widgets only paint it.
 *   hovered  brighter, with a white frame inside
 *   shown    the chat on screen in the left pane: bold white text, a thick blue bar on its left (painted inside,
 *            so the text keeps its place)
 * The two are independent: the shown chat lights up on hover like any other.
 */
export const HOVER_CLASS = 'brightness-150 ring-2 ring-inset ring-white';
export const SHOWN_CLASS = 'shadow-[inset_4px_0_0_0_#3794ff] font-bold text-white';

export type EntryLook = {
  /** The family's color, for the background. */
  color: string;
  kind: QueueKind;
  shown: boolean;
  hovered: boolean;
  /** The classes of the two marks above, as they apply. */
  shownClass: string;
  hoverClass: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** A lookup by entry, for the list and the forest. */
export function useEntryLook(): (entry: QueueEntry) => EntryLook {
  const colors = useFamilyColors();
  const hover = useQueueHover();
  const shownId = useShownChat();
  return (entry) => {
    const shown = isChat(entry, shownId);
    const hovered = hover === entry.key;
    return {
      color: colors.get(entry.rootKey) ?? 'transparent',
      kind: entry.kind,
      shown,
      hovered,
      shownClass: shown ? SHOWN_CLASS : '',
      hoverClass: hovered ? HOVER_CLASS : '',
      onMouseEnter: () => setQueueHover(entry.key),
      onMouseLeave: () => setQueueHover(null),
    };
  };
}

/** A lookup by a chat's session id (either of its ids), for the tab rows; null for a chat not in the queue. */
export function useChatLook(): (sessionId: string) => EntryLook | null {
  const queue = useQueue();
  const lookOf = useEntryLook();
  return (sessionId) => {
    const entry = entryOfChat(queue.entries, sessionId);
    return entry ? lookOf(entry) : null;
  };
}
