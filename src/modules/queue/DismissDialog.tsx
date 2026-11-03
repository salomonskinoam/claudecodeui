import { useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { dismissQueueEntry } from '@/modules/queue/queueStore';
import type { QueueEntry } from '@/modules/queue/types';

const primary = 'rounded-sm bg-[#3794ff] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f7fe0] disabled:opacity-50';
const secondary = 'rounded-sm border border-[#454647] px-4 py-1.5 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

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
      <DialogContent className="w-[440px] max-w-[92vw] rounded-md border border-[#454647] bg-[#1E1F22] p-5 text-[#cccccc] shadow-2xl" data-quests-queue="dismiss">
        {/* The shared DialogTitle is screen-reader only by default: made visible here. */}
        <DialogTitle className="not-sr-only text-[15px] font-semibold leading-snug text-white">Hide "{entry.chatName ?? entry.title}" until it replies again?</DialogTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-[#9a9a9a]">Its next reply brings it back. Archive still shows it.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondary} disabled={busy} onClick={onDone}>Cancel</button>
          <button type="button" className={primary} disabled={busy} onClick={yes}>Hide</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
