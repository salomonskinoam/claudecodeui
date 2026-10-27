import { queueDb } from '@/modules/database/index.js';
import { groupOf, needsNoam, rootOf, type QueueGroup, type QueueKind, type QueueOrderEntry, type QueueState } from '@/modules/queue/queue-order.js';
import { getCursorTabs } from '@/modules/queue/sources/cursor-tabs.js';
import { getLive } from '@/modules/queue/sources/live.js';
import { getPageTabs } from '@/modules/queue/sources/page-tabs.js';
import { getTickets, openBlockersOf, type Ticket } from '@/modules/queue/sources/tickets.js';
import { getTitles } from '@/modules/queue/sources/transcripts.js';

/**
 * quests priority queue: the entries, built from the sources on every read. One entry per open ticket and per
 * chat that is live, open as a tab (page or Cursor), or left a closing line and was not finalized. A chat that
 * claimed a ticket is that ticket's entry, not its own.
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
  /** The attached chat's name (rename, else Claude's title), shown on hover. */
  chatName: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
  group: QueueGroup;
  needsNoam: boolean;
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
const OUTSIDE = new Set(['claude-vscode', 'claude-desktop', 'cli']);
const LINE_STATE: Record<string, QueueState> = { question: 'question', done: 'done', 'waiting for': 'waiting', blocker: 'blocker' };

const kindOf = (t: Ticket): QueueKind => KINDS.find((k) => t.labels.includes(k)) ?? 'quest';
const time = (s: string | null | undefined): number => (s ? Date.parse(s) : 0);

export function buildEntries(): QueueEntry[] {
  const tickets = getTickets();
  const live = getLive();
  const cursorTabs = new Set(getCursorTabs());
  const titles = getTitles();
  const sessions = new Map(queueDb.listClaudeSessions().map((s) => [s.provider_session_id, s]));
  const lines = new Map(queueDb.listChats().map((c) => [c.provider_session_id, c]));
  const open = new Set(tickets.map((t) => t.number));

  // A ticket shows its newest claimant whose chat is still open. A claim by a closed (finalized) chat does not
  // count: the ticket drops back to the ticket level, as if unclaimed (Noam 2026-10-27). A chat's own ticket is
  // the open one it claimed without an open parent, else the first it claimed (the tickets' session start hook).
  const closed = (sid: string) => lines.get(sid)?.finalized === 1;
  const claimant = new Map<number, string>();
  const ticketOf = new Map<string, number>();
  for (const t of tickets) {
    const c = t.claims.filter((x) => !closed(x.sid)).pop();
    if (c) claimant.set(t.number, c.sid);
    const isRoot = !(t.parent && t.parent.state === 'OPEN' && open.has(t.parent.number));
    for (const { sid } of t.claims) if (!ticketOf.has(sid) || isRoot) ticketOf.set(sid, t.number);
  }

  const chatState = (sid: string): { state: QueueState; since: number; line: string | null } => {
    const p = live.get(sid);
    const l = lines.get(sid);
    const line = l?.line_kind ? `${l.line_kind} ${l.line_text}` : null;
    if (p?.status === 'waiting' && p.waitingFor === 'permission prompt') return { state: 'permission', since: p.statusUpdatedAt, line };
    if (p?.status === 'busy') return { state: 'running', since: p.statusUpdatedAt, line };
    if (p?.status === 'waiting') return { state: 'question', since: p.statusUpdatedAt, line };
    if (l?.line_kind) return { state: LINE_STATE[l.line_kind], since: time(l.line_at), line };
    return { state: 'none', since: p?.statusUpdatedAt ?? 0, line };
  };
  const chatName = (sid: string) => titles.get(sid) ?? sessions.get(sid)?.custom_name ?? live.get(sid)?.name ?? sid;
  const chatFields = (sid: string | null) => {
    const s = sid ? sessions.get(sid) : undefined;
    return {
      sessionId: s?.session_id ?? sid,
      providerSessionId: sid,
      chatName: sid ? chatName(sid) : null,
      projectPath: s?.project_path ?? null,
      heldOutside: sid ? OUTSIDE.has(live.get(sid)?.entrypoint ?? '') || cursorTabs.has(sid) : false,
      open: sid ? live.has(sid) || cursorTabs.has(sid) : false,
    };
  };

  const entries: Omit<QueueEntry, 'rootKey' | 'group' | 'needsNoam'>[] = [];
  for (const t of tickets) {
    const sid = claimant.get(t.number) ?? null;
    const kind = kindOf(t);
    const st = sid ? chatState(sid) : { state: 'unclaimed' as QueueState, since: time(t.createdAt), line: null };
    const blocks = kind === 'blocker'
      ? t.blocksSids.map((s) => (ticketOf.has(s) ? `ticket:${ticketOf.get(s)}` : `chat:${s}`))
      : [];
    entries.push({
      key: `ticket:${t.number}`, kind, title: t.title, url: t.url, number: t.number,
      parentKey: t.parent && t.parent.state === 'OPEN' && open.has(t.parent.number) ? `ticket:${t.parent.number}` : null,
      blocks, state: st.state, since: st.since || time(t.createdAt), closingLine: st.line,
      world: t.labels.find((l) => !NOT_WORLDS.has(l)) ?? null, parentChatSid: t.parentChatSid, openBlockers: openBlockersOf(t.number),
      startFolder: (t.parentChatSid && sessions.get(t.parentChatSid)?.project_path?.replace(/\/\.claude\/worktrees\/[^/]+$/, '')) || null,
      ...chatFields(sid),
    });
  }
  const chatSids = new Set([
    ...live.keys(),
    ...[...lines.values()].filter((l) => l.line_kind && !l.finalized).map((l) => l.provider_session_id),
    ...getPageTabs(),
    ...[...cursorTabs].filter((sid) => !closed(sid)),
  ]);
  for (const sid of chatSids) {
    if (ticketOf.has(sid) && claimant.get(ticketOf.get(sid)!) === sid) continue;
    const st = chatState(sid);
    entries.push({
      key: `chat:${sid}`, kind: 'chat', title: chatName(sid), url: null, number: null, parentKey: null, blocks: [],
      state: st.state, since: st.since, closingLine: st.line, world: null, parentChatSid: null, openBlockers: [],
      startFolder: null, ...chatFields(sid),
    });
  }
  const byKey = new Map(entries.map((e) => [e.key, e as QueueOrderEntry]));
  return entries.map((e) => ({ ...e, rootKey: rootOf(e.key, byKey), group: groupOf(e), needsNoam: needsNoam(e) }));
}
