import { useEffect, useState } from 'react';

import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import { useEntryLook } from '@/modules/queue/entryLook';
import QueueGroupLine from '@/modules/queue/QueueGroupLine';
import QueueLine from '@/modules/queue/QueueLine';
import QueueToolbar from '@/modules/queue/QueueToolbar';
import RenameDialog from '@/modules/queue/RenameDialog';
import TabContextMenu from '@/modules/queue/TabContextMenu';
import { setQueueOpener, setTicketStarter } from '@/modules/queue/queueNavigation';
import { dismissQueueEntry, sendQueueEntryToEnd, setQueueArchived, useQueue } from '@/modules/queue/queueStore';
import { useQueueView } from '@/modules/queue/queueView';
import TicketGroups, { TicketGroupMenu } from '@/modules/queue/TicketGroups';
import type { QueueEntry } from '@/modules/queue/types';
import { useBlink } from '@/modules/queue/useBlink';
import { useLineDrag } from '@/modules/queue/useLineDrag';
import { useOpenEntry } from '@/modules/queue/useOpenEntry';

type QueueListProps = {
  onNewSession: () => void;
  /** "Claim this ticket" on a ticket's page: a new chat for it; the chat asks for its own name at its start. */
  onStartTicket: (entry: QueueEntry) => void;
};

/**
 * quests priority queue: the session list: the five drawers of queueView.ts ("Pending chats" open by default,
 * the others collapsed). In archive mode (no button) every entry in queue order, with a separator before the
 * tickets no chat has claimed, and the Archived drawer.
 */
export default function QueueList({ onNewSession, onStartTicket }: QueueListProps) {
  const queue = useQueue();
  const { mode, lines, active, hold, unclaimed, archived } = useQueueView();
  const lookOf = useEntryLook();
  const open = useOpenEntry();
  useEffect(() => { setQueueOpener(open); setTicketStarter(onStartTicket); });
  const blinking = useBlink(queue);
  const [closing, setClosing] = useState<QueueEntry | null>(null);
  // quests: a right-click on a line opens the chat's menu (rename, pin, send to the end, on hold, Cursor, the ticket).
  const [menu, setMenu] = useState<{ sessionId: string; entryKey: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<QueueEntry | null>(null);
  // quests: Noam's groups of unclaimed tickets: a right-click on a ticket or a group header, and the header being renamed.
  const [ticketMenu, setTicketMenu] = useState<{ target: { ticket: number } | { group: number }; x: number; y: number } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<number | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['Pending chats']));
  const toggle = (label: string) => setOpenGroups((g) => { const n = new Set(g); if (n.has(label)) n.delete(label); else n.add(label); return n; });

  // Lines the view shows where the stored order has them: not the permission prompts, not the pinned chat.
  const anchors = new Set([...lines, ...active, ...hold, ...unclaimed, ...archived].filter((e) => e.state !== 'permission' && e.key !== queue.latch).map((e) => e.key));
  const { marker, lineProps, listProps } = useLineDrag(queue.view, anchors);

  const line = (e: QueueEntry, separator: boolean) => (
    <QueueLine
      key={e.key}
      entry={e}
      look={lookOf(e)}
      blinking={blinking.has(e.key)}
      latched={queue.latch === e.key}
      separator={separator}
      marker={marker}
      drag={lineProps(e.key, e.state !== 'permission' && e.key !== queue.latch)}
      onOpen={(event) => open(e, event)}
      onCloseTicket={() => setClosing(e)}
      onDismiss={() => void dismissQueueEntry(e.key)}
      onSendToEnd={() => void sendQueueEntryToEnd(e.key)}
      onArchive={() => void setQueueArchived(e.key, !e.archived)}
      onMenu={e.sessionId ? (event) => { event.preventDefault(); setMenu({ sessionId: e.sessionId as string, entryKey: e.key, x: event.clientX, y: event.clientY }); }
        : e.number !== null && e.state === 'unclaimed' ? (event) => { event.preventDefault(); setTicketMenu({ target: { ticket: e.number as number }, x: event.clientX, y: event.clientY }); } : undefined}
      onRename={e.sessionId ? () => setRenaming(e) : undefined}
    />
  );
  const groups: Array<[string, QueueEntry[]]> = mode === 'focus'
    ? [['Pending chats', lines], ['Active chats', active], ['On hold', hold], ['Tickets-Unclaimed', unclaimed], ['Archived', archived]]
    : [['Archived', archived]];

  return (
    <div className="flex flex-col" data-quests-queue="list" data-quests-mode={mode}>
      <QueueToolbar onNewSession={onNewSession} />
      <div {...listProps}>
        {mode === 'archive' && lines.map((e, i) => line(e, i > 0 && (lines[i - 1].group === 2) !== (e.group === 2)))}
        {groups.map(([label, members]) => (
          <div key={label}>
            <QueueGroupLine label={label} count={members.length} open={openGroups.has(label)} onToggle={() => toggle(label)} />
            {openGroups.has(label) && (label === 'Tickets-Unclaimed'
              ? <TicketGroups members={members} line={(e) => line(e, false)} renaming={renamingGroup} onRenamed={() => setRenamingGroup(null)}
                  onHeaderMenu={(index, event) => setTicketMenu({ target: { group: index }, x: event.clientX, y: event.clientY })} />
              : members.map((e) => line(e, false)))}
          </div>
        ))}
      </div>
      {closing && <CloseTicketDialog entry={closing} entries={queue.entries} onDone={() => setClosing(null)} />}
      {menu && <TabContextMenu sessionId={menu.sessionId} entryKey={menu.entryKey} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
      {ticketMenu && <TicketGroupMenu target={ticketMenu.target} x={ticketMenu.x} y={ticketMenu.y} onRename={setRenamingGroup} onClose={() => setTicketMenu(null)} />}
      {renaming?.sessionId && <RenameDialog sessionId={renaming.sessionId} current={renaming.chatName ?? renaming.title} onDone={() => setRenaming(null)} />}
    </div>
  );
}
