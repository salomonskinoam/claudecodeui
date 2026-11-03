import { useState } from 'react';

import { api } from '@/shared/api';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import type { QueueEntry } from '@/modules/queue/types';

const btn = 'rounded-sm border border-[#454647] px-3 py-1 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

/**
 * quests: rename a chat from its tab, its list line or its forest node (requirement 48). The name goes to the
 * page's session row and, through the Agent SDK, to the transcript's custom title, the one Cursor and the queue
 * read, so every place shows the same name within a few seconds.
 */
export default function RenameDialog({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const [name, setName] = useState(entry.chatName ?? entry.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const next = name.trim();
    if (!next || !entry.sessionId) return;
    setBusy(true);
    api.renameSession(entry.sessionId, next)
      .then((response) => (response.ok ? onDone() : response.text().then((t) => { setError(t.slice(0, 200)); setBusy(false); })))
      .catch((e: unknown) => { setError(String(e)); setBusy(false); });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(); }}>
      <DialogContent className="max-w-md bg-[#1E1F22] text-[#cccccc]" data-quests-queue="rename">
        <DialogTitle className="not-sr-only text-[14px] font-medium">Rename the chat</DialogTitle>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
          className="mt-2 w-full rounded-sm border border-[#454647] bg-[#161718] px-2 py-1 text-[13px] text-[#cccccc] outline-none focus:border-[#3794ff]"
        />
        <p className="mt-1 text-[12px] text-[#7f8081]">The chats' format is "mon_dd world two words", plus " #ticket" for a ticket's chat.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className={btn} disabled={busy || !name.trim()} onClick={save}>Save</button>
          <button type="button" className={btn} disabled={busy} onClick={onDone}>Cancel</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
