import { memo, useMemo, useState } from 'react';

import { Markdown } from '@/modules/chat/transcript/Markdown';
import { lastSummary } from '@/modules/chat/utils/lastSummary';
import type { ChatMessage } from '@/shared/types';

const storageKey = (sessionId: string) => `quests.summaryDrawer.${sessionId}`;
const readOpen = (sessionId: string | null): boolean => {
  if (!sessionId) return false;
  try { return localStorage.getItem(storageKey(sessionId)) === 'open'; } catch { return false; }
};

/**
 * quests (requirement 107): a drawer between the chat and the right sidebar that shows the last Summary, so it stays
 * readable while a new turn scrolls it away. Collapsed by default; each chat remembers its own state.
 */
function SummaryDrawer({ sessionId, chatMessages }: { sessionId: string | null; chatMessages: ChatMessage[] }) {
  const [openFor, setOpenFor] = useState<{ id: string | null; open: boolean }>(() => ({ id: sessionId, open: readOpen(sessionId) }));
  const open = openFor.id === sessionId ? openFor.open : readOpen(sessionId);
  const summary = useMemo(() => lastSummary(chatMessages), [chatMessages]);
  if (!sessionId) return null;
  const toggle = () => {
    setOpenFor({ id: sessionId, open: !open });
    try { localStorage.setItem(storageKey(sessionId), open ? 'closed' : 'open'); } catch { /* per-viewer convenience only */ }
  };
  return (
    <div className="flex h-full flex-shrink-0 border-l border-border/50" data-summary-drawer={open ? 'open' : 'closed'}>
      <button
        type="button"
        onClick={toggle}
        title={open ? 'Close the Summary' : 'Open the Summary of the last reply'}
        className="flex w-6 items-center justify-center bg-muted/40 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <span className="[writing-mode:vertical-rl]">Summary</span>
      </button>
      {open && (
        <div className="w-[400px] overflow-y-auto px-4 py-3 text-sm" data-summary-body>
          {summary ? <Markdown>{summary}</Markdown> : <p className="text-muted-foreground">No Summary yet.</p>}
        </div>
      )}
    </div>
  );
}

export default memo(SummaryDrawer);
