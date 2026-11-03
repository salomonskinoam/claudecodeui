import { useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { dismissQueueEntry } from '@/modules/queue/queueStore';
import type { QueueEntry } from '@/modules/queue/types';

const primary = 'rounded-sm bg-[#3794ff] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f7fe0] disabled:opacity-50';
const secondary = 'rounded-sm border border-[#454647] px-4 py-1.5 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

/**
 * quests priority queue: the pause icon's popup. "Put <chat name> on hold?" Yes moves the chat to the "On hold"
 * group of the list, where Noam opens it on his own; its next reply brings it back. Cancel does nothing.
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
        <DialogTitle className="not-sr-only text-[15px] font-semibold leading-snug text-white">Put "{entry.chatName ?? entry.title}" on hold?</DialogTitle>
        <p className="mt-2 text-[13px] leading-relaxed text-[#9a9a9a]">It waits in the "On hold" group, where you open it when you want. Its next reply brings it back.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondary} disabled={busy} onClick={onDone}>Cancel</button>
          <button type="button" className={primary} disabled={busy} onClick={yes}>On hold</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
