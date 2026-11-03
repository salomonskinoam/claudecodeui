import { useEffect, useState } from 'react';

import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import DismissDialog from '@/modules/queue/DismissDialog';
import RenameDialog from '@/modules/queue/RenameDialog';
import { sendQueueEntryToEnd, setQueueLatch, useQueue } from '@/modules/queue/queueStore';
import { entryOfChat } from '@/modules/queue/types';

type TabContextMenuProps = {
  /** The tab's chat (its page session id). */
  sessionId: string;
  x: number;
  y: number;
  onClose: () => void;
  /** Present on a tab: the "Close tab" item. */
  onCloseTab?: () => void;
};

const item = 'block w-full px-3 py-1 text-left text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

/**
 * quests: the right-click menu of a tab, with the chat's options of its line in the list (Noam, 2 Nov: "right
 * click on the tab in the tabs page should also give chat options from the list view such as the hide").
 */
export default function TabContextMenu({ sessionId, x, y, onClose, onCloseTab }: TabContextMenuProps) {
  const queue = useQueue();
  const entry = entryOfChat(queue.entries, sessionId);
  const [dialog, setDialog] = useState<'hide' | 'ticket' | 'rename' | null>(null);

  useEffect(() => {
    if (dialog) return undefined;
    const away = () => onClose();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [dialog, onClose]);

  if (dialog === 'hide' && entry) return <DismissDialog entry={entry} onDone={onClose} />;
  if (dialog === 'rename' && entry) return <RenameDialog entry={entry} onDone={onClose} />;
  if (dialog === 'ticket' && entry) return <CloseTicketDialog entry={entry} entries={queue.entries} onDone={onClose} />;

  const latched = entry ? queue.latch === entry.key : false;
  return (
    <div
      className="fixed z-50 min-w-[200px] rounded-sm border border-[#454647] bg-[#1E1F22] py-1 shadow-lg"
      style={{ left: x, top: y }}
      data-quests-tab-menu={sessionId}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {entry && (
        <>
          {entry.sessionId && <button type="button" className={item} data-quests-menu="rename" onClick={() => setDialog('rename')}>Rename…</button>}
          <button type="button" className={item} onClick={() => { void setQueueLatch(latched ? null : entry.key); onClose(); }}>{latched ? 'Unpin' : 'Pin on top'}</button>
          <button type="button" className={item} onClick={() => { void sendQueueEntryToEnd(entry.key); onClose(); }}>Send to the end of the queue</button>
          <button type="button" className={item} onClick={() => setDialog('hide')}>Hide until it replies again</button>
          {entry.providerSessionId && (
            <a className={item} href={`cursor://anthropic.claude-code/open?session=${entry.providerSessionId}`} onClick={onClose}>Open in Cursor</a>
          )}
          {entry.number !== null && (
            <button type="button" className={item} onClick={() => setDialog('ticket')}>Close the ticket #{entry.number}</button>
          )}
        </>
      )}
      {onCloseTab && <button type="button" className={item} onClick={() => { onCloseTab(); onClose(); }}>Close tab</button>}
    </div>
  );
}
