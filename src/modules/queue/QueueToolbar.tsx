import { Plus, RefreshCw } from 'lucide-react';

import { syncTabsFromCursor } from '@/modules/queue/queueNavigation';

const BUTTON = 'mx-2 flex h-[26px] items-center gap-2 whitespace-nowrap rounded-sm px-2 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

/** quests priority queue: the two buttons above the list, each on its own line. */
export default function QueueToolbar({ onNewSession }: { onNewSession: () => void }) {
  return (
    <div className="mb-1 flex flex-col">
      <button type="button" data-quests-queue="new-session" title="A new empty chat" className={BUTTON} onClick={onNewSession}>
        <Plus className="h-3.5 w-3.5 flex-shrink-0" />
        New Session
      </button>
      <button
        type="button"
        data-quests-queue="sync-cursor"
        title="The chats open in Cursor go on top of the queue and become this page's tabs"
        className={BUTTON}
        onClick={() => void syncTabsFromCursor()}
      >
        <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
        Sync from Cursor
      </button>
    </div>
  );
}
