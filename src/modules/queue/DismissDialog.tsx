import { useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { dismissQueueEntry } from '@/modules/queue/queueStore';
import type { QueueEntry } from '@/modules/queue/types';

const btn = 'rounded-sm border border-[#454647] px-3 py-1 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

/**
 * quests priority queue: the trash icon's popup. "Hide <chat name> until it replies again?" Yes hides the chat
 * from the list (Archive still shows it); its next reply brings it back. Cancel does nothing.
 */
export default function DismissDialog({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yes = () => {
    setBusy(true);
    dismissQueueEntry(entry.key).then(onDone, (e: unknown) => { setError(String(e)); setBusy(false); });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(); }}>
      <DialogContent className="max-w-md bg-[#1E1F22] text-[#cccccc]" data-quests-queue="dismiss">
        {/* The shared DialogTitle is screen-reader only by default: made visible here (Noam, 2 Nov: the popup showed two buttons and no question). */}
        <DialogTitle className="not-sr-only text-[14px] font-medium">Hide "{entry.chatName ?? entry.title}" until it replies again?</DialogTitle>
        <p className="mt-1 text-[12px] text-[#7f8081]">Its next reply brings it back. Archive still shows it.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className={btn} disabled={busy} onClick={yes}>Yes</button>
          <button type="button" className={btn} disabled={busy} onClick={onDone}>Cancel</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
