import { useEffect, useState } from 'react';

import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import DismissDialog from '@/modules/queue/DismissDialog';
import { useEntryLook } from '@/modules/queue/entryLook';
import QueueGroupLine from '@/modules/queue/QueueGroupLine';
import QueueLine from '@/modules/queue/QueueLine';
import QueueToolbar from '@/modules/queue/QueueToolbar';
import { setQueueOpener } from '@/modules/queue/queueNavigation';
import { sendQueueEntryToEnd, useQueue } from '@/modules/queue/queueStore';
import { useQueueView } from '@/modules/queue/queueView';
import type { QueueEntry } from '@/modules/queue/types';
import { useBlink } from '@/modules/queue/useBlink';
import { useLineDrag } from '@/modules/queue/useLineDrag';
import { useOpenEntry } from '@/modules/queue/useOpenEntry';

type QueueListProps = {
  onNewSession: () => void;
  /** Start a new chat for a ticket that no chat has claimed; the chat asks for its own name at its start. */
  onStartTicket: (entry: QueueEntry) => void;
};

/**
 * quests priority queue: the session list. In focus mode (the default) the chats that wait for Noam, then two
 * collapsed groups, "Live chats" and "Tickets-Unclaimed"; in archive mode every entry in queue order, in three
 * groups with a separator between them (open chats, chats closed without /finalize-chat, unclaimed tickets).
 */
export default function QueueList({ onNewSession, onStartTicket }: QueueListProps) {
  const queue = useQueue();
  const { mode, lines, live, unclaimed } = useQueueView();
  const lookOf = useEntryLook();
  const open = useOpenEntry(onStartTicket);
  useEffect(() => setQueueOpener(open));
  const blinking = useBlink(queue);
  const [closing, setClosing] = useState<QueueEntry | null>(null);
  const [dismissing, setDismissing] = useState<QueueEntry | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggle = (label: string) => setOpenGroups((g) => { const n = new Set(g); if (n.has(label)) n.delete(label); else n.add(label); return n; });

  // Lines the view shows where the stored order has them: not the permission prompts, not the pinned chat.
  const anchors = new Set([...lines, ...live, ...unclaimed].filter((e) => e.state !== 'permission' && e.key !== queue.latch).map((e) => e.key));
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
      drag={lineProps(e.key, e.rootKey === e.key && e.state !== 'permission' && e.key !== queue.latch)}
      onOpen={(event) => open(e, event)}
      onCloseTicket={() => setClosing(e)}
      onDismiss={() => setDismissing(e)}
      onSendToEnd={() => void sendQueueEntryToEnd(e.key)}
    />
  );
  const groups: Array<[string, QueueEntry[]]> = [['Live chats', live], ['Tickets-Unclaimed', unclaimed]];

  return (
    <div className="flex flex-col" data-quests-queue="list" data-quests-mode={mode}>
      <QueueToolbar onNewSession={onNewSession} />
      <div {...listProps}>
        {lines.map((e, i) => line(e, mode === 'archive' && i > 0 && lines[i - 1].group !== e.group))}
        {mode === 'focus' && groups.map(([label, members]) => (
          <div key={label}>
            <QueueGroupLine label={label} count={members.length} open={openGroups.has(label)} onToggle={() => toggle(label)} />
            {openGroups.has(label) && members.map((e) => line(e, false))}
          </div>
        ))}
      </div>
      {closing && <CloseTicketDialog entry={closing} entries={queue.entries} onDone={() => setClosing(null)} />}
      {dismissing && <DismissDialog entry={dismissing} onDone={() => setDismissing(null)} />}
    </div>
  );
}
