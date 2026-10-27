import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { openRightTab } from '@/shared/hooks/useSplitPane';
import type { QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: opening an entry. Its chat becomes a left-pane tab (Ctrl/Cmd: a right-pane tab); a ticket
 * no chat has claimed starts a new chat for it (`onStartTicket`), which asks for its own name at its start.
 */
export function useOpenEntry(onStartTicket: (entry: QueueEntry) => void) {
  const navigate = useNavigate();
  return (entry: QueueEntry, event?: MouseEvent) => {
    if (!entry.sessionId) {
      onStartTicket(entry);
      return;
    }
    if (event && (event.metaKey || event.ctrlKey)) openRightTab(entry.sessionId);
    else navigate(`/session/${entry.sessionId}`);
  };
}
