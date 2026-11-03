import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { openRightTab, ticketTabId } from '@/shared/hooks/useSplitPane';
import type { QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: opening an entry. Its chat becomes a left-pane tab (Ctrl/Cmd: a right-pane tab); a ticket
 * no chat has claimed opens its page, for reading, with "Claim this ticket" on it (Noam, 3 Nov: "when clicking a
 * ticket in tickets unclaimed, i want to see the ticket body in the chat window for reading").
 */
export function useOpenEntry() {
  const navigate = useNavigate();
  return (entry: QueueEntry, event?: MouseEvent) => {
    const right = Boolean(event && (event.metaKey || event.ctrlKey));
    if (!entry.sessionId) {
      if (entry.number === null) return;
      if (right) openRightTab(ticketTabId(entry.number));
      else navigate(`/ticket/${entry.number}`);
      return;
    }
    if (right) openRightTab(entry.sessionId);
    else navigate(`/session/${entry.sessionId}`);
  };
}
