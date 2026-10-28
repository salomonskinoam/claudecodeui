import { useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { openNextInQueue } from '@/modules/queue/queueNavigation';
import { dismissQueueEntry, useQueue } from '@/modules/queue/queueStore';
import { entryOfChat } from '@/modules/queue/types';

const btn = 'rounded-sm border border-[#454647] px-3 py-1 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

type DoneButtonProps = {
  /** The page's session id of the chat in the composer; null for a new chat. */
  sessionId: string | null;
  /** Anything typed in the input box: the button is grayed out and disabled. */
  hasInput: boolean;
  /** Sends a message in this chat, as if typed. */
  onSendText: (text: string) => void;
};

/**
 * quests priority queue: the DONE button at the end of the chat, next to "Next" (requirement 27). Pressed: if the
 * chat is still in the queue (so it never ran /finalize-chat), a popup asks "Do you want to finalize the chat
 * first?": Yes sends /finalize-chat to the chat, then hides it from the queue and opens the next chat that waits;
 * No hides it and opens the next; Cancel does nothing. A chat no longer in the queue only opens the next.
 */
export default function DoneButton({ sessionId, hasInput, onSendText }: DoneButtonProps) {
  const queue = useQueue();
  const [asking, setAsking] = useState(false);
  const entry = entryOfChat(queue.entries, sessionId);

  const finish = async (finalizeFirst: boolean) => {
    setAsking(false);
    if (finalizeFirst) onSendText('/finalize-chat');
    if (entry) await dismissQueueEntry(entry.key).catch((error: unknown) => console.error(error));
    openNextInQueue();
  };

  return (
    <>
      <button
        type="button"
        data-quests-done="button"
        title={hasInput ? 'Send or clear what is typed first' : 'Done with this chat: hide it from the queue and bring the next one'}
        disabled={hasInput}
        className={cn('h-[26px] rounded-sm border border-[#505050] px-2 text-[14px] text-[#cccccc]', hasInput ? 'opacity-40' : 'hover:bg-[#2a2d2e]')}
        onClick={() => (entry ? setAsking(true) : void finish(false))}
      >
        DONE
      </button>
      {asking && (
        <Dialog open onOpenChange={(open) => { if (!open) setAsking(false); }}>
          <DialogContent className="max-w-md bg-[#1E1F22] text-[#cccccc]" data-quests-done="popup">
            <DialogTitle>Do you want to finalize the chat first?</DialogTitle>
            <p className="text-[13px]">Yes runs /finalize-chat in this chat, then hides it from the queue and brings the next one. No only hides it and brings the next one.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className={btn} onClick={() => void finish(true)}>Yes</button>
              <button type="button" className={btn} onClick={() => void finish(false)}>No</button>
              <button type="button" className={btn} onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
