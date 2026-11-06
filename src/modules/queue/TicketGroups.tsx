import { useEffect, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/shared/utils';
import { setTicketGroups, useQueue } from '@/modules/queue/queueStore';
import type { QueueEntry, TicketGroup } from '@/modules/queue/types';

/**
 * quests priority queue: Noam's own groups inside the "Tickets-Unclaimed" drawer (3 Nov: "i want tickets unclaimed
 * to have a +group and allow me to group tickets myself with names i give myself"). Each group is a named header
 * with its tickets under it, in queue order; tickets in no group come last, under "Ungrouped" when groups exist.
 * "+ group" at the end asks for a name. Everything is editable with visible buttons (Noam, 6 Nov: "it has to be
 * editable, the goups, the association. they should be collapsable too"): a header's pencil renames the group,
 * its trash deletes it (its tickets become ungrouped), a click on the header folds or opens it; a ticket's
 * folder button (and its right-click) moves it to a group. The list is kept on the server, whole; which groups
 * are folded is this browser's own.
 */
const FOLDED_KEY = 'quests-ticket-groups-folded';
const readFolded = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};
const ICON = 'flex h-5 w-5 items-center justify-center rounded opacity-0 hover:bg-white/10 group-hover/header:opacity-80';
const HEADER = 'mx-1 ml-5 mt-1 flex h-[22px] items-center gap-2 rounded-sm px-2 text-[13px] text-[#9d9d9d]';
const ITEM = 'block w-full px-3 py-1 text-left text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

function NameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(initial);
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onDone(name.trim() || null);
    if (event.key === 'Escape') onDone(null);
  };
  return (
    <input
      autoFocus
      value={name}
      placeholder="Group name"
      data-quests-ticket-group-input=""
      className="mx-1 ml-5 mt-1 h-[22px] w-[calc(100%-1.5rem)] rounded-sm border border-[#454647] bg-[#1E1F22] px-2 text-[13px] text-white outline-none"
      onChange={(event) => setName(event.target.value)}
      onKeyDown={keys}
      onBlur={() => onDone(name.trim() || null)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

type Props = {
  /** The drawer's tickets, in queue order. */
  members: QueueEntry[];
  /** While the list is filtered: a group with no matching ticket is not drawn. */
  hideEmpty?: boolean;
  line: (entry: QueueEntry) => ReactNode;
  /** A right-click on a header: the group's menu (rename, delete). */
  onHeaderMenu: (index: number, event: MouseEvent) => void;
  /** The header being renamed (its index), if any; `onRenamed` ends it, `onRename` starts it (the pencil). */
  renaming: number | null;
  onRenamed: () => void;
  onRename: (index: number) => void;
};

export default function TicketGroups({ members, hideEmpty, line, onHeaderMenu, renaming, onRenamed, onRename }: Props) {
  const groups = useQueue().ticketGroups;
  const [adding, setAdding] = useState(false);
  const [folded, setFolded] = useState(readFolded);
  const fold = (name: string) => setFolded((f) => {
    const next = new Set(f);
    if (next.has(name)) next.delete(name); else next.add(name);
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* this page load only */ }
    return next;
  });
  const inSome = new Set(groups.flatMap((g) => g.tickets));
  const ungrouped = members.filter((e) => e.number === null || !inSome.has(e.number));
  const save = (next: TicketGroup[]) => void setTicketGroups(next).catch((error: unknown) => console.error(error));
  // A search shows every match, folded or not.
  const isFolded = (name: string) => !hideEmpty && folded.has(name);
  const header = (name: string, label: string, count: number, edit: { index: number } | null) => (
    <div className={cn(HEADER, 'group/header cursor-pointer hover:bg-[#2a2d2e]')} data-quests-ticket-group={name} data-quests-ticket-group-count={count}
      data-quests-ticket-group-folded={isFolded(name) ? 'true' : undefined}
      onClick={() => fold(name)}
      onContextMenu={edit ? (event) => { event.preventDefault(); onHeaderMenu(edit.index, event); } : undefined}>
      {isFolded(name) ? <ChevronRight className="h-3 w-3 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 flex-shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label} ({count})</span>
      {edit && (
        <>
          <button type="button" title="Rename the group" className={ICON} data-quests-ticket-group-rename=""
            onClick={(event) => { event.stopPropagation(); onRename(edit.index); }}>
            <Pencil className="h-3 w-3" />
          </button>
          <button type="button" title="Delete the group (its tickets stay, ungrouped)" className={ICON} data-quests-ticket-group-delete=""
            onClick={(event) => { event.stopPropagation(); save(groups.filter((_, j) => j !== edit.index)); }}>
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
  return (
    <>
      {groups.map((g, i) => {
        const own = members.filter((e) => e.number !== null && g.tickets.includes(e.number));
        if (hideEmpty && own.length === 0) return null;
        return (
          <div key={g.name}>
            {renaming === i ? (
              <NameInput initial={g.name} onDone={(name) => { onRenamed(); if (name && name !== g.name) save(groups.map((x, j) => (j === i ? { ...x, name } : x))); }} />
            ) : header(g.name, g.name, own.length, { index: i })}
            {!isFolded(g.name) && own.map(line)}
          </div>
        );
      })}
      {groups.length > 0 && ungrouped.length > 0 && header('', 'Ungrouped', ungrouped.length, null)}
      {!(groups.length > 0 && isFolded('')) && ungrouped.map(line)}
      {adding ? (
        <NameInput initial="" onDone={(name) => { setAdding(false); if (name && !groups.some((g) => g.name === name)) save([...groups, { name, tickets: [] }]); }} />
      ) : (
        <button type="button" className={cn(HEADER, 'cursor-pointer hover:bg-[#2a2d2e] hover:text-[#cccccc]')} data-quests-ticket-group-add="" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3" /> group
        </button>
      )}
    </>
  );
}

/** The menu of a right-click: on a ticket, the group to put it in; on a header, rename or delete the group. */
export function TicketGroupMenu({ target, x, y, onRename, onClose }: {
  target: { ticket: number } | { group: number };
  x: number;
  y: number;
  onRename: (index: number) => void;
  onClose: () => void;
}) {
  const groups = useQueue().ticketGroups;
  useEffect(() => {
    const close = () => onClose();
    const keys = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', keys); };
  }, [onClose]);
  const save = (next: TicketGroup[]) => { void setTicketGroups(next).catch((error: unknown) => console.error(error)); onClose(); };
  const move = (ticket: number, to: string | null) => save(groups.map((g) => ({ ...g, tickets: g.name === to ? [...g.tickets.filter((t) => t !== ticket), ticket] : g.tickets.filter((t) => t !== ticket) })));
  return (
    <div className="fixed z-50 min-w-[200px] rounded-sm border border-[#454647] bg-[#1E1F22] py-1 shadow-lg" style={{ left: x, top: y }}
      data-quests-ticket-group-menu="" onMouseDown={(event) => event.stopPropagation()}>
      {'ticket' in target ? (
        <>
          {groups.map((g) => (
            <button key={g.name} type="button" className={cn(ITEM, g.tickets.includes(target.ticket) && 'text-white')} onClick={() => move(target.ticket, g.name)}>
              {g.tickets.includes(target.ticket) ? '✓ ' : ''}{g.name}
            </button>
          ))}
          <button type="button" className={ITEM} onClick={() => move(target.ticket, null)}>No group</button>
        </>
      ) : (
        <>
          <button type="button" className={ITEM} onClick={() => { onRename(target.group); onClose(); }}>Rename…</button>
          <button type="button" className={ITEM} onClick={() => save(groups.filter((_, i) => i !== target.group))}>Delete the group (its tickets stay, ungrouped)</button>
        </>
      )}
    </div>
  );
}
