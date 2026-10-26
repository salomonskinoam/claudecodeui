import { useState } from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/shared/ui';
import { postQueue } from '@/modules/queue/useQueue';
import type { QueueEntry } from '@/modules/queue/useQueue';

type NameChatDialogProps = { entry: QueueEntry; onStart: (name: string) => void; onCancel: () => void };

const today = () => {
  const d = new Date();
  return `${d.toLocaleString("en", { month: "short" }).toLowerCase()}_${String(d.getDate()).padStart(2, '0')}`;
};
const field = 'rounded-sm border border-[#505050] bg-[#3c3c3c] px-2 py-1 text-[14px] text-[#cccccc]';
const btn = 'rounded-sm border border-[#454647] px-3 py-1 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-50';

/**
 * quests priority queue: the name of a new chat for a ticket, always "<mon_dd> <world> <word> <word> #<ticket>".
 * The user types the world and the two words, or lets Claude Haiku choose them from the ticket.
 */
export default function NameChatDialog({ entry, onStart, onCancel }: NameChatDialogProps) {
  const [world, setWorld] = useState(entry.world ?? '');
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = `${today()} ${world.trim()} ${words.trim()} #${entry.number}`;
  const valid = /^\S+$/.test(world.trim()) && /^\S+ \S+$/.test(words.trim());

  const haiku = () => {
    setBusy(true);
    postQueue<{ name: string }>('/suggest-name', { number: entry.number }).then(({ name: n }) => {
      const m = n.match(/^[a-z]{3}_\d\d (\S+) (\S+ \S+) #\d+$/);
      if (!m) throw new Error(`Haiku gave "${n}"`);
      setWorld(m[1]);
      setWords(m[2]);
    }).catch((e: unknown) => setError(String(e))).finally(() => setBusy(false));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-lg bg-[#1E1F22] text-[#cccccc]">
        <DialogTitle>Name the chat for ticket #{entry.number}</DialogTitle>
        <p className="text-[13px]">{entry.title}</p>
        <div className="mt-2 flex items-center gap-2 text-[14px]">
          <span>{today()}</span>
          <input className={`${field} w-28`} value={world} placeholder="world" onChange={(e) => setWorld(e.target.value)} />
          <input className={`${field} w-48`} value={words} placeholder="two words" onChange={(e) => setWords(e.target.value)} />
          <span>#{entry.number}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className={btn} disabled={busy} onClick={haiku}>{busy ? 'Haiku is choosing...' : 'Let Haiku choose'}</button>
          <button type="button" className={btn} disabled={busy || !valid} onClick={() => onStart(name)}>Start</button>
          <button type="button" className={btn} onClick={onCancel}>Cancel</button>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
