import { Archive, Plus, RefreshCw } from 'lucide-react';

import { cn } from '@/shared/utils';
import { syncTabsFromCursor } from '@/modules/queue/queueNavigation';
import { setQueueMode, useQueueMode } from '@/modules/queue/queueView';

const BUTTON = 'mx-2 flex h-[26px] items-center gap-2 whitespace-nowrap rounded-sm px-2 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

/** quests priority queue: the buttons above the list, each on its own line: new chat, sync from Cursor, Archive. */
export default function QueueToolbar({ onNewSession }: { onNewSession: () => void }) {
  const mode = useQueueMode();
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
      <button
        type="button"
        data-quests-queue="archive"
        title={mode === 'archive' ? 'Back to the chats that wait for you' : 'Show every chat and ticket'}
        className={cn(BUTTON, mode === 'archive' && 'bg-[#2a2d2e] text-white')}
        onClick={() => setQueueMode(mode === 'archive' ? 'focus' : 'archive')}
      >
        <Archive className="h-3.5 w-3.5 flex-shrink-0" />
        Archive
      </button>
    </div>
  );
}
