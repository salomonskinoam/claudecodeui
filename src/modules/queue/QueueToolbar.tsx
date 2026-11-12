import { HeartPulse, Palette, Plus, RefreshCw } from 'lucide-react';

import { authenticatedFetch } from '@/shared/api';

import { reassignColors } from '@/modules/queue/familyColors';
import { syncTabsFromCursor } from '@/modules/queue/queueNavigation';

const BUTTON = 'mx-2 flex h-[26px] items-center gap-2 whitespace-nowrap rounded-sm px-2 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

type Revive = { text: string; send: Array<{ sessionId: string; title: string }>; outside: string[] };

/**
 * "Revive from crash" (requirement 123): the server lists the chats that should be alive but are not; after Noam's
 * yes it sends them its message. Pressed by hand only.
 */
async function reviveFromCrash(): Promise<void> {
  const ask = await authenticatedFetch('/api/quests/revive');
  if (!ask.ok) throw new Error(`revive: ${ask.status} ${await ask.text()}`);
  const { text, send, outside } = (await ask.json()).data as Revive;
  const cursor = outside.length ? `\n\nOpen in Cursor, not messaged (send it there yourself):\n${outside.join('\n')}` : '';
  if (send.length === 0) {
    window.alert(`No chat to revive: every chat that waits for something has a process or a listener running.${cursor}`);
    return;
  }
  if (!window.confirm(`Are you sure? This will message\n\n"${text}"\n\nto these ${send.length} chats:\n${send.map((c) => c.title).join('\n')}${cursor}`)) return;
  const sent = await authenticatedFetch('/api/quests/revive', { method: 'POST' });
  if (!sent.ok) throw new Error(`revive: ${sent.status} ${await sent.text()}`);
}

/** quests priority queue: the buttons above the list, each on its own line: new chat, sync from Cursor, Recolor, Revive. */
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
      <button
        type="button"
        data-quests-queue="recolor"
        title="Fresh colors: the chats in view take the ten strong ones"
        className={BUTTON}
        onClick={reassignColors}
      >
        <Palette className="h-3.5 w-3.5 flex-shrink-0" />
        Recolor
      </button>
      <button
        type="button"
        data-quests-queue="revive"
        title="After a crash: message every chat that should be running but is not"
        className={BUTTON}
        onClick={() => void reviveFromCrash().catch((error: unknown) => window.alert(String(error)))}
      >
        <HeartPulse className="h-3.5 w-3.5 flex-shrink-0" />
        Revive from crash
      </button>
    </div>
  );
}
