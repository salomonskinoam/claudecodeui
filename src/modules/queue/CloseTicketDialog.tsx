import { useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { closeQueueTicket } from '@/modules/queue/queueStore';
import type { QueueEntry } from '@/modules/queue/types';

type CloseTicketDialogProps = { entry: QueueEntry; entries: QueueEntry[]; onDone: () => void };

const btn = 'rounded-sm border border-[#454647] px-3 py-1 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

/**
 * quests priority queue: closing a ticket from the page. A root (a quest, or a ticket with no open parent) that
 * still has open blockers asks first what happens to them; any other ticket asks a plain confirm.
 */
export default function CloseTicketDialog({ entry, entries, onDone }: CloseTicketDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const blockers = entry.rootKey === entry.key ? entry.openBlockers : [];
  const title = (n: number) => entries.find((e) => e.number === n)?.title ?? '';

  const choose = (choice: string) => {
    setBusy(true);
    closeQueueTicket(entry.number!, choice).then(onDone, (e: unknown) => { setError(String(e)); setBusy(false); });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(); }}>
      <DialogContent className="max-w-lg bg-[#1E1F22] text-[#cccccc]">
        <DialogTitle>Close ticket #{entry.number}?</DialogTitle>
        <p className="text-[13px]">{entry.title}</p>
        {blockers.length > 0 && (
          <div className="text-[13px]">
            <p className="mt-2">Are you sure? It still has open blockers:</p>
            <ul className="ml-4 list-disc">
              {blockers.map((n) => <li key={n}>#{n} {title(n)}</li>)}
            </ul>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={busy} onClick={() => choose('close')}>Yes, close it</button>
          {blockers.length > 0 && (
            <>
              <button type="button" className={btn} disabled={busy} onClick={() => choose('blockers-to-quest')}>Convert the blockers to quests</button>
              <button type="button" className={btn} disabled={busy} onClick={() => choose('blockers-to-sidequest')}>Convert the blockers to side quests</button>
              <button type="button" className={btn} disabled={busy} onClick={() => choose('close-blockers')}>Close the blockers too</button>
              <span className="flex items-center gap-1">
                <input value={kind} onChange={(e) => setKind(e.target.value.trim())} placeholder="other kind"
                  className="w-28 rounded-sm border border-[#505050] bg-[#3c3c3c] px-2 py-1 text-[13px]" />
                <button type="button" className={btn} disabled={busy || !/^[\w-]+$/.test(kind)} onClick={() => choose(`kind:${kind}`)}>Convert</button>
              </span>
            </>
          )}
          <button type="button" className={btn} disabled={busy} onClick={onDone}>Cancel</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
