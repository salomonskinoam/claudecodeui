import { getChats, isHeldOutside, isOpen, type Chat } from '@/modules/queue/chats.js';
import { pageClaims } from '@/modules/queue/page-claims.js';
import { readPlacements, resolvePlacement, type Where } from '@/modules/queue/placement.js';
import { groupOf, rootOf, waitsForMe, type QueueGroup, type QueueKind, type QueueOrderEntry, type QueueState } from '@/modules/queue/queue-order.js';
import { getTickets, openBlockersOf, type Ticket } from '@/modules/queue/sources/tickets.js';

/**
 * quests priority queue: the entries, built from the tickets and the chats on every read. One entry per open
 * ticket and per chat that is open, or left a closing line and was not finalized. A chat that claimed a ticket is
 * that ticket's entry, not its own.
 */

/** One line of the queue, as the page shows it. */
export type QueueEntry = QueueOrderEntry & {
  /**
   * The entry's one name, the same on the line, the forest, the tab and the header: the attached chat's name
   * (rename, else Claude's title), else the ticket's title for a ticket no chat holds.
   */
  title: string;
  /** For tickets: the ticket's own title on GitHub. */
  ticketTitle: string | null;
  /** The ticket's GitHub page, for tickets. */
  url: string | null;
  number: number | null;
  /** The chat attached to the entry: the page's session id (for opening) and Claude Code's. */
  sessionId: string | null;
  providerSessionId: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  group: QueueGroup;
  /** Waits for Noam's input: a permission prompt, or a question or Done he has not dismissed. The list shows these. */
  waitsForMe: boolean;
  /** The chat has a running process, whatever its state. */
  live: boolean;
  /** Where Noam put the entry: the queue, "On hold" or "Archived" (placement.ts). One flag. */
  placement: Where;
  /** When it was put on hold or archived (epoch ms; 0 for the ones from before the time was kept); null in the queue. */
  placedAt: number | null;
  /** The time of the chat's last reply, the dismissal's key. */
  replyAt: string | null;
  /** The chat's last activity (epoch ms, 0 for none): its process's last status change, or its last reply. */
  activityAt: number;
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
  projectPath: c?.projectPath ?? null,
  closingLine: c?.closingLine ? `${c.closingLine.kind} ${c.closingLine.text}` : null,
  heldOutside: c ? isHeldOutside(c) : false,
  open: c ? isOpen(c) : false,
  live: c?.process != null,
  replyAt: c?.closingLine?.at ?? null,
  activityAt: Math.max(c?.process?.statusUpdatedAt ?? 0, time(c?.closingLine?.at)),
});

/**
 * Who holds which ticket, one to one (Noam, 4 Nov: "a chat can't hold 2 tickets and 1 ticket cant be in 2 chats.
 * it's always 1:1. tickets can be created by a ticket chat, but never claimed. and chats may have 0 tickets but not
 * 2"). The claims count in the order they were made: a claim counts only when its chat holds no ticket yet and the
 * ticket has no holder. A finalized chat holds nothing, so its ticket goes to the next claim that counts, or back to
 * the ticket level. `claimant`: ticket number -> its chat. `ticketOf`: chat -> its ticket, the same pairs reversed.
 */
export function resolveClaims(
  tickets: Pick<Ticket, 'number' | 'claims'>[],
  over: (sid: string) => boolean,
): { claimant: Map<number, string>; ticketOf: Map<string, number> } {
  const claimant = new Map<number, string>();
  const ticketOf = new Map<string, number>();
  const claims = tickets.flatMap((t) => t.claims.map((c) => ({ number: t.number, sid: c.sid, at: c.at }))).sort((a, b) => a.at - b.at);
  for (const { number, sid } of claims) {
    if (over(sid) || claimant.has(number) || ticketOf.has(sid)) continue;
    claimant.set(number, sid);
    ticketOf.set(sid, number);
  }
  return { claimant, ticketOf };
}

export function buildEntries(): QueueEntry[] {
  const tickets = getTickets();
  const chats = getChats();
  const openTickets = new Set(tickets.map((t) => t.number));
  // A chat started from a ticket's tab claims it at once (page-claims.ts), by Claude's id once the chat has one.
  const claudeIdOf = new Map([...chats.values()].filter((c) => c.pageSessionId).map((c) => [c.pageSessionId as string, c.sid]));
  const fromPage = pageClaims();
  const claimed = tickets.map((t) => {
    const p = fromPage.get(t.number);
    return p ? { ...t, claims: [...t.claims, { name: 'page', sid: claudeIdOf.get(p.sessionId) ?? p.sessionId, at: p.at }] } : t;
  });
  const { claimant, ticketOf } = resolveClaims(claimed, (sid) => chats.get(sid)?.finalized ?? false);

  const entries: Omit<QueueEntry, 'rootKey' | 'group' | 'waitsForMe' | 'placement' | 'placedAt'>[] = [];
  for (const t of tickets) {
    const chat = chats.get(claimant.get(t.number) ?? '') ?? null;
    const kind = kindOf(t);
    const st = chat ? stateOf(chat) : { state: 'unclaimed' as QueueState, since: time(t.createdAt) };
    const opener = t.parentChatSid ? chats.get(t.parentChatSid) : undefined;
    entries.push({
      key: `ticket:${t.number}`, kind, title: chat?.name ?? t.title, ticketTitle: t.title, url: t.url, number: t.number,
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
    if (ticketOf.has(c.sid)) continue;
    const st = stateOf(c);
    entries.push({
      key: `chat:${c.sid}`, kind: 'chat', title: c.name, ticketTitle: null, url: null, number: null, parentKey: null, blocks: [],
      state: st.state, since: st.since, world: null, parentChatSid: null, openBlockers: [], startFolder: null,
      ...chatFields(c),
    });
  }
  const byKey = new Map(entries.map((e) => [e.key, e as QueueOrderEntry]));
  // Only an entry in the queue waits for Noam: a permission prompt, a question or a Done.
  const placements = readPlacements();
  return entries.map((e) => {
    const { where, at } = resolvePlacement(placements[e.key], e.replyAt ?? 'none', e.activityAt);
    return { ...e, rootKey: rootOf(e.key, byKey), group: groupOf(e), placement: where, placedAt: at, waitsForMe: where === 'queue' && (e.state === 'permission' || waitsForMe(e)) };
  });
}
