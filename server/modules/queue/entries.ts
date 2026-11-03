import { getChats, isHeldOutside, isOpen, type Chat } from '@/modules/queue/chats.js';
import { archivedAt } from '@/modules/queue/archived.js';
import { dismissedAt } from '@/modules/queue/dismissals.js';
import { groupOf, rootOf, waitsForMe, type QueueGroup, type QueueKind, type QueueOrderEntry, type QueueState } from '@/modules/queue/queue-order.js';
import { getTickets, openBlockersOf, type Ticket } from '@/modules/queue/sources/tickets.js';

/**
 * quests priority queue: the entries, built from the tickets and the chats on every read. One entry per open
 * ticket and per chat that is open, or left a closing line and was not finalized. A chat that claimed a ticket is
 * that ticket's entry, not its own.
 */

/** One line of the queue, as the page shows it. */
export type QueueEntry = QueueOrderEntry & {
  title: string;
  /** The ticket's GitHub page, for tickets. */
  url: string | null;
  number: number | null;
  /** The chat attached to the entry: the page's session id (for opening) and Claude Code's. */
  sessionId: string | null;
  providerSessionId: string | null;
  /** The attached chat's name, shown on hover. */
  chatName: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  group: QueueGroup;
  /** Waits for Noam's input: a permission prompt, or a question or Done he has not dismissed. The list shows these. */
  waitsForMe: boolean;
  /** The chat has a running process, whatever its state. */
  live: boolean;
  /** Noam dismissed the chat's current reply (the pause icon); over when it replies again. */
  dismissed: boolean;
  /** Noam archived the entry (the archive icon): it waits in the "Archived" drawer, whatever it does, until he takes it out. */
  archived: boolean;
  /** When it was archived (epoch ms; 0 for the ones archived before the time was kept), else null. */
  archivedAt: number | null;
  /** The time of the chat's last reply, the dismissal's key. */
  replyAt: string | null;
  /** Open in another editor (Cursor, the Claude desktop app, a terminal): read-only in the page. */
  heldOutside: boolean;
  closingLine: string | null;
  /** For tickets: the session id in the ticket's "## Parent chat" section. */
  parentChatSid: string | null;
  /** For tickets: the numbers of its open blockers (for the close popup). */
  openBlockers: number[];
  /** For tickets: the folder a new chat for it starts in, the folder of the chat that opened it (a worktree cut back to its repo). */
  startFolder: string | null;
};

const KINDS: QueueKind[] = ['quest', 'sidequest', 'blocker'];
const NOT_WORLDS = new Set([...KINDS, 'priority-high', 'waiting on Noam']);
const LINE_STATE: Record<string, QueueState> = { question: 'question', done: 'done', 'waiting for': 'waiting', blocker: 'blocker' };

const kindOf = (t: Ticket): QueueKind => KINDS.find((k) => t.labels.includes(k)) ?? 'quest';
const time = (s: string | null | undefined): number => (s ? Date.parse(s) : 0);

/** The queue state of a chat: its process first, else its closing line. */
export function stateOf(c: Chat): { state: QueueState; since: number } {
  const p = c.process;
  if (p?.status === 'waiting' && p.waitingFor === 'permission prompt') return { state: 'permission', since: p.statusUpdatedAt };
  if (p?.status === 'busy') return { state: 'running', since: p.statusUpdatedAt };
  if (p?.status === 'waiting') return { state: 'question', since: p.statusUpdatedAt };
  if (c.closingLine) return { state: LINE_STATE[c.closingLine.kind], since: time(c.closingLine.at) };
  return { state: 'none', since: p?.statusUpdatedAt ?? 0 };
}

const chatFields = (c: Chat | null) => ({
  sessionId: c ? c.pageSessionId ?? c.sid : null,
  providerSessionId: c?.sid ?? null,
  chatName: c?.name ?? null,
  projectPath: c?.projectPath ?? null,
  closingLine: c?.closingLine ? `${c.closingLine.kind} ${c.closingLine.text}` : null,
  heldOutside: c ? isHeldOutside(c) : false,
  open: c ? isOpen(c) : false,
  live: c?.process != null,
  replyAt: c?.closingLine?.at ?? null,
});

export function buildEntries(): QueueEntry[] {
  const tickets = getTickets();
  const chats = getChats();
  const openTickets = new Set(tickets.map((t) => t.number));
  const over = (sid: string) => chats.get(sid)?.finalized ?? false;

  // A ticket shows its newest claimant whose chat is not over. A claim by a finalized chat does not count: the
  // ticket drops back to the ticket level, as if unclaimed (Noam 2026-10-27). One chat holds one ticket (Noam,
  // 3 Nov: "never allow two tickets to be owned by the same chat again"): a chat that would hold several keeps
  // the one it claimed first, its claims on the others do not count, and the others go to their next claimant,
  // or to the ticket level. A chat's own ticket is the open one it claimed without an open parent, else the
  // first it claimed (the tickets' session start hook).
  const claimant = new Map<number, string>();
  const ticketOf = new Map<string, number>();
  const ignored = new Set<string>(); // `${sid}:${number}`: a claim that does not count
  for (;;) {
    claimant.clear();
    for (const t of tickets) {
      const c = t.claims.filter((x) => !over(x.sid) && !ignored.has(`${x.sid}:${t.number}`)).pop();
      if (c) claimant.set(t.number, c.sid);
    }
    const held = new Map<string, number[]>();
    for (const [number, sid] of claimant) held.set(sid, [...(held.get(sid) ?? []), number]);
    let changed = false;
    for (const [sid, numbers] of held) {
      if (numbers.length < 2) continue;
      const first = (n: number) => tickets.find((t) => t.number === n)!.claims.find((x) => x.sid === sid)!.at;
      const keep = numbers.reduce((a, b) => (first(b) < first(a) ? b : a));
      for (const n of numbers) if (n !== keep) { ignored.add(`${sid}:${n}`); changed = true; }
    }
    if (!changed) break;
  }
  for (const t of tickets) {
    const isRoot = !(t.parent && t.parent.state === 'OPEN' && openTickets.has(t.parent.number));
    for (const { sid } of t.claims) if (!ignored.has(`${sid}:${t.number}`) && (!ticketOf.has(sid) || isRoot)) ticketOf.set(sid, t.number);
  }

  const entries: Omit<QueueEntry, 'rootKey' | 'group' | 'waitsForMe' | 'dismissed' | 'archived' | 'archivedAt'>[] = [];
  for (const t of tickets) {
    const chat = chats.get(claimant.get(t.number) ?? '') ?? null;
    const kind = kindOf(t);
    const st = chat ? stateOf(chat) : { state: 'unclaimed' as QueueState, since: time(t.createdAt) };
    const opener = t.parentChatSid ? chats.get(t.parentChatSid) : undefined;
    entries.push({
      key: `ticket:${t.number}`, kind, title: t.title, url: t.url, number: t.number,
      parentKey: t.parent && t.parent.state === 'OPEN' && openTickets.has(t.parent.number) ? `ticket:${t.parent.number}` : null,
      blocks: kind === 'blocker' ? t.blocksSids.map((s) => (ticketOf.has(s) ? `ticket:${ticketOf.get(s)}` : `chat:${s}`)) : [],
      state: st.state, since: st.since || time(t.createdAt),
      world: t.labels.find((l) => !NOT_WORLDS.has(l)) ?? null, parentChatSid: t.parentChatSid, openBlockers: openBlockersOf(t.number),
      startFolder: opener?.projectPath?.replace(/\/\.claude\/worktrees\/[^/]+$/, '') ?? null,
      ...chatFields(chat),
    });
  }
  // A chat is in the queue while it is open, or until it is finalized once its last reply left a closing line.
  for (const c of chats.values()) {
    if (!(isOpen(c) || (c.closingLine && !c.finalized))) continue;
    if (ticketOf.has(c.sid) && claimant.get(ticketOf.get(c.sid)!) === c.sid) continue;
    const st = stateOf(c);
    entries.push({
      key: `chat:${c.sid}`, kind: 'chat', title: c.name, url: null, number: null, parentKey: null, blocks: [],
      state: st.state, since: st.since, world: null, parentChatSid: null, openBlockers: [], startFolder: null,
      ...chatFields(c),
    });
  }
  const byKey = new Map(entries.map((e) => [e.key, e as QueueOrderEntry]));
  // A dismissed reply hides a question or a Done; a permission prompt always waits, dismissed or not.
  return entries.map((e) => {
    const dismissed = dismissedAt(e.key) === (e.replyAt ?? 'none');
    const at = archivedAt(e.key);
    const archived = at !== undefined;
    return { ...e, rootKey: rootOf(e.key, byKey), group: groupOf(e), dismissed, archived, archivedAt: at ?? null, waitsForMe: !archived && (e.state === 'permission' || (waitsForMe(e) && !dismissed)) };
  });
}
