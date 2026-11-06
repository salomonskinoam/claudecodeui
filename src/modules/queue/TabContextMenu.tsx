import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/shared/utils';
import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import RenameDialog from '@/modules/queue/RenameDialog';
import { placeQueueEntry, setQueueLatch, useQueue } from '@/modules/queue/queueStore';
import { entryOfChat, PLACES } from '@/modules/queue/types';

type TabContextMenuProps = {
  /** The tab's chat (its page session id). */
  sessionId: string;
  /** From a list line: that line's entry, so a chat holding two tickets gets the right ticket items. */
  entryKey?: string;
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
export default function TabContextMenu({ sessionId, entryKey, x, y, onClose, onCloseTab }: TabContextMenuProps) {
  const queue = useQueue();
  const navigate = useNavigate();
  const entry = entryKey ? queue.entries.find((e) => e.key === entryKey) : entryOfChat(queue.entries, sessionId);
  const [dialog, setDialog] = useState<'ticket' | 'rename' | null>(null);

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

  if (dialog === 'rename' && entry?.sessionId) return <RenameDialog sessionId={entry.sessionId} current={entry.title} onDone={onClose} />;
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
          {PLACES.map((p) => (
            <button key={p.where} type="button" className={cn(item, entry.placement === p.where && p.where !== 'queue' && 'text-[#3794ff]')}
              data-quests-menu={`place-${p.where}`} onClick={() => { void placeQueueEntry(entry.key, p.where); onClose(); }}>
              {p.label}{entry.placement === p.where && p.where !== 'queue' ? ' (here now)' : ''}
            </button>
          ))}
          {entry.providerSessionId && (
            <a className={item} href={`cursor://anthropic.claude-code/open?session=${entry.providerSessionId}`} onClick={onClose}>Open in Cursor</a>
          )}
          {entry.number !== null && (
            <button type="button" className={item} data-quests-menu="ticket-page" onClick={() => { navigate(`/ticket/${entry.number}`); onClose(); }}>Ticket #{entry.number}: its page</button>
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
