import { useState } from 'react';

import { api } from '@/shared/api';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';

const primary = 'rounded-sm bg-[#3794ff] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f7fe0] disabled:opacity-50';
const secondary = 'rounded-sm border border-[#454647] px-4 py-1.5 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

/**
 * quests: rename a chat from its tab, its list line or its forest node (requirement 48). The name goes to the
 * page's session row and, through the Agent SDK, to the transcript's custom title, the one Cursor and the queue
 * read, so every place shows the same name within a few seconds.
 */
export default function RenameDialog({ sessionId, current, onDone }: { sessionId: string; current: string; onDone: () => void }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const next = name.trim();
    if (!next) return;
    setBusy(true);
    api.renameSession(sessionId, next)
      .then((response) => (response.ok ? onDone() : response.text().then((t) => { setError(t.slice(0, 200)); setBusy(false); })))
      .catch((e: unknown) => { setError(String(e)); setBusy(false); });
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onDone(); }}>
      <DialogContent className="w-[440px] max-w-[92vw] rounded-md border border-[#454647] bg-[#1E1F22] p-5 text-[#cccccc] shadow-2xl" data-quests-queue="rename">
        <DialogTitle className="not-sr-only text-[15px] font-semibold leading-snug text-white">Rename the chat</DialogTitle>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
          className="mt-3 w-full rounded-sm border border-[#454647] bg-[#161718] px-3 py-2 text-[14px] text-[#cccccc] outline-none focus:border-[#3794ff]"
        />
        <p className="mt-2 text-[13px] leading-relaxed text-[#9a9a9a]">The chats' format is "mon_dd area two words" (the area is one of the repo's areas), plus " #ticket" for a ticket's chat.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondary} disabled={busy} onClick={onDone}>Cancel</button>
          <button type="button" className={primary} disabled={busy || !name.trim()} onClick={save}>Save</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
