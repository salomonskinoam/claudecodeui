import { useEffect, useState } from 'react';

import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import { useEntryLook } from '@/modules/queue/entryLook';
import QueueLine from '@/modules/queue/QueueLine';
import QueueToolbar from '@/modules/queue/QueueToolbar';
import { setQueueOpener } from '@/modules/queue/queueNavigation';
import { useQueue } from '@/modules/queue/queueStore';
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
 * quests priority queue: the session list as one flat list in queue order, top first, in three groups with a
 * separator between them (open chats, chats closed without /finalize-chat, unclaimed tickets).
 */
export default function QueueList({ onNewSession, onStartTicket }: QueueListProps) {
  const queue = useQueue();
  const lookOf = useEntryLook();
  const open = useOpenEntry(onStartTicket);
  useEffect(() => setQueueOpener(open));
  const blinking = useBlink(queue);
  const byKey = new Map(queue.entries.map((e) => [e.key, e]));
  const lines = queue.view.map((k) => byKey.get(k)).filter((e): e is QueueEntry => Boolean(e));
  // Lines the view shows where the stored order has them: not the permission prompts, not the latched chat.
  const anchors = new Set(lines.filter((e) => e.state !== 'permission' && e.key !== queue.latch).map((e) => e.key));
  const { marker, lineProps, listProps } = useLineDrag(queue.view, anchors);
  const [closing, setClosing] = useState<QueueEntry | null>(null);

  return (
    <div className="flex flex-col" data-quests-queue="list">
      <QueueToolbar onNewSession={onNewSession} />
      <div {...listProps}>
        {lines.map((e, i) => (
          <QueueLine
            key={e.key}
            entry={e}
            look={lookOf(e)}
            blinking={blinking.has(e.key)}
            latched={queue.latch === e.key}
            separator={i > 0 && lines[i - 1].group !== e.group}
            marker={marker}
            drag={lineProps(e.key, e.rootKey === e.key && e.state !== 'permission' && e.key !== queue.latch)}
            onOpen={(event) => open(e, event)}
            onCloseTicket={() => setClosing(e)}
          />
        ))}
      </div>
      {closing && <CloseTicketDialog entry={closing} entries={queue.entries} onDone={() => setClosing(null)} />}
    </div>
  );
}
