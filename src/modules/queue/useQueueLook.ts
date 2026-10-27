import { useFamilyColors } from '@/modules/queue/familyColors';
import { HOVER_CLASS } from '@/modules/queue/looks';
import { hoverQueueSession, useQueueHover } from '@/modules/queue/queueHover';
import { useQueue } from '@/modules/queue/queueStore';
import type { QueueKind } from '@/modules/queue/types';

export type QueueLook = {
  /** The family's color, for the background. */
  color: string;
  kind: QueueKind;
  /** The hover look when this chat is the hovered entry anywhere, else an empty string. */
  hoverClass: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/**
 * quests priority queue: how a chat is decorated outside the queue widgets (the tab rows): its family color,
 * its kind's sign, and the shared hover. Answers a lookup by page session id, null for a chat not in the queue.
 */
export function useQueueLook(): (sessionId: string) => QueueLook | null {
  const queue = useQueue();
  const colors = useFamilyColors();
  const hover = useQueueHover();
  return (sessionId) => {
    const entry = queue.entries.find((e) => e.sessionId === sessionId);
    if (!entry) return null;
    return {
      color: colors.get(entry.rootKey) ?? 'transparent',
      kind: entry.kind,
      hoverClass: hover === entry.key ? HOVER_CLASS : '',
      onMouseEnter: () => hoverQueueSession(sessionId),
      onMouseLeave: () => hoverQueueSession(null),
    };
  };
}
