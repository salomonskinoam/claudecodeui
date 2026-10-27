import { queueDb } from '@/modules/database/index.js';
import { drag as dragOrder, repair, rootOf, view as viewOrder, needsNoam, type QueueKind, type QueueOrderEntry, type QueueState } from '@/modules/queue/queue-order.js';
import {
  TICKETS_REPO, getCursorTabs, getLive, getTickets, noteRecentTranscripts, refreshCursorTabs, refreshLive, refreshTickets, run,
  type Ticket,
} from '@/modules/queue/services/queue-sources.service.js';

/** One line of the queue, as the page shows it. */
export type QueueEntry = QueueOrderEntry & {
  title: string;
  /** The ticket's GitHub page, for tickets. */
  url: string | null;
  number: number | null;
  /** The chat attached to the entry: the page's session id (for opening) and Claude Code's. */
  sessionId: string | null;
  providerSessionId: string | null;
  projectPath: string | null;
  world: string | null;
  rootKey: string;
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
  const tabs = getCursorTabs();
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
  const chatFields = (sid: string | null) => {
    const s = sid ? sessions.get(sid) : undefined;
    return {
      sessionId: s?.session_id ?? sid,
      providerSessionId: sid,
      projectPath: s?.project_path ?? null,
      heldOutside: sid ? OUTSIDE.has(live.get(sid)?.entrypoint ?? '') || tabs.has(sid) : false,
    };
  };

  const entries: Omit<QueueEntry, 'rootKey'>[] = [];
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
      blocks, state: st.state, since: st.since || time(t.createdAt), needsNoam: false, closingLine: st.line,
      world: t.labels.find((l) => !NOT_WORLDS.has(l)) ?? null, parentChatSid: t.parentChatSid, openBlockers: openBlockersOf(t.number),
      startFolder: (t.parentChatSid && sessions.get(t.parentChatSid)?.project_path?.replace(/\/\.claude\/worktrees\/[^/]+$/, '')) || null,
      ...chatFields(sid),
    });
  }
  const chatSids = new Set([...live.keys(), ...[...lines.values()].filter((l) => l.line_kind && !l.finalized).map((l) => l.provider_session_id)]);
  for (const sid of chatSids) {
    if (ticketOf.has(sid)) continue;
    const st = chatState(sid);
    const name = sessions.get(sid)?.custom_name ?? live.get(sid)?.name ?? sid;
    entries.push({
      key: `chat:${sid}`, kind: 'chat', title: name, url: null, number: null, parentKey: null, blocks: [],
      state: st.state, since: st.since, needsNoam: false, closingLine: st.line, world: null, parentChatSid: null, openBlockers: [],
      startFolder: null, ...chatFields(sid),
    });
  }
  const byKey = new Map(entries.map((e) => [e.key, e as QueueOrderEntry]));
  return entries.map((e) => ({ ...e, rootKey: rootOf(e.key, byKey), needsNoam: needsNoam(e as QueueOrderEntry) }));
}

// ---- the stored order, and its mirror on GitHub ----------------------------------------------------------

const MIRROR_PATH = 'queue/order.json';
const MIRROR_BRANCH = 'queue-state';
let mirrorTimer: NodeJS.Timeout | null = null;

async function writeMirror(): Promise<void> {
  const body = JSON.stringify({ order: queueDb.getState('order') ?? [], latch: queueDb.getState('latch') ?? null, updatedAt: new Date().toISOString() }, null, 1);
  const branch = await run('gh', ['api', `repos/${TICKETS_REPO}/git/ref/heads/${MIRROR_BRANCH}`]).catch(() => null);
  if (!branch) {
    const { stdout: main } = await run('gh', ['api', `repos/${TICKETS_REPO}/git/ref/heads/main`, '--jq', '.object.sha']);
    await run('gh', ['api', '-X', 'POST', `repos/${TICKETS_REPO}/git/refs`, '-f', `ref=refs/heads/${MIRROR_BRANCH}`, '-f', `sha=${main.trim()}`]);
  }
  const sha = await run('gh', ['api', `repos/${TICKETS_REPO}/contents/${MIRROR_PATH}?ref=${MIRROR_BRANCH}`, '--jq', '.sha'])
    .then((r) => r.stdout.trim()).catch(() => '');
  await run('gh', ['api', '-X', 'PUT', `repos/${TICKETS_REPO}/contents/${MIRROR_PATH}`, '-f', 'message=queue order',
    '-f', `content=${Buffer.from(body).toString('base64')}`, '-f', `branch=${MIRROR_BRANCH}`, ...(sha ? ['-f', `sha=${sha}`] : [])]);
}

function scheduleMirror(): void {
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    writeMirror().catch((error: unknown) => console.error('[Queue] mirror failed', { error: String(error) }));
  }, 10_000);
  mirrorTimer.unref?.();
}

async function restoreMirror(): Promise<void> {
  if (queueDb.getState('order') !== undefined) return;
  const file = await run('gh', ['api', `repos/${TICKETS_REPO}/contents/${MIRROR_PATH}?ref=${MIRROR_BRANCH}`, '--jq', '.content']).catch(() => null);
  if (!file) return; // no mirror yet: the order starts empty
  const saved = JSON.parse(Buffer.from(file.stdout, 'base64').toString('utf8'));
  queueDb.setState('order', saved.order);
  queueDb.setState('latch', saved.latch);
}

let restored = false;

function store(order: string[]): void {
  if (!restored) return; // never write over the mirror before it was read back
  const before = queueDb.getState<string[]>('order') ?? [];
  if (JSON.stringify(before) === JSON.stringify(order)) return;
  queueDb.setState('order', order);
  scheduleMirror();
}

export function getQueue() {
  const entries = buildEntries();
  const order = repair(queueDb.getState<string[]>('order') ?? [], entries);
  store(order);
  const stored = queueDb.getState<string | null>('latch') ?? null;
  const latch = stored && entries.some((e) => e.key === stored) ? stored : null;
  return { entries, order, latch, view: viewOrder(order, latch, entries) };
}

export function setOrder(order: string[]) {
  store(repair(order, buildEntries()));
  return getQueue();
}

/** Drag `key` to stand before `beforeKey` (null: last): the server's copy of the page's live drag. */
export function dragTo(key: string, beforeKey: string | null) {
  const entries = buildEntries();
  store(dragOrder(repair(queueDb.getState<string[]>('order') ?? [], entries), entries, key, beforeKey));
  return getQueue();
}

/** The view a drag would give, without storing it: the page's live preview while the mouse button is held. */
export function previewDrag(key: string, beforeKey: string | null): string[] {
  const entries = buildEntries();
  const order = dragOrder(repair(queueDb.getState<string[]>('order') ?? [], entries), entries, key, beforeKey);
  const latch = queueDb.getState<string | null>('latch') ?? null;
  return viewOrder(order, latch && entries.some((e) => e.key === latch) ? latch : null, entries);
}

export function setLatch(key: string | null) {
  queueDb.setState('latch', key);
  scheduleMirror();
  return getQueue();
}

// ---- actions --------------------------------------------------------------------------------------------

export type CloseChoice = 'close' | 'blockers-to-quest' | 'blockers-to-sidequest' | 'close-blockers' | `kind:${string}`;

/** The open blockers of a ticket: its open sub-issues labeled blocker, and open blockers naming a chat that claimed it. */
export function openBlockersOf(number: number): number[] {
  const tickets = getTickets();
  const t = tickets.find((x) => x.number === number);
  const sids = new Set(t?.claims.map((c) => c.sid) ?? []);
  return tickets
    .filter((b) => b.labels.includes('blocker') && b.number !== number
      && (b.parent?.number === number || b.blocksSids.some((s) => sids.has(s))))
    .map((b) => b.number);
}

export async function closeTicket(number: number, choice: CloseChoice): Promise<void> {
  const R = ['-R', TICKETS_REPO];
  const blockers = openBlockersOf(number);
  const toKind = choice === 'blockers-to-quest' ? 'quest' : choice === 'blockers-to-sidequest' ? 'sidequest'
    : choice.startsWith('kind:') ? choice.slice(5) : null;
  for (const b of blockers) {
    if (toKind) await run('gh', ['issue', 'edit', String(b), ...R, '--add-label', toKind, '--remove-label', 'blocker']);
    if (choice === 'close-blockers') await run('gh', ['issue', 'close', String(b), ...R]);
  }
  const when = new Date().toLocaleString('sv-SE').slice(0, 16);
  await run('gh', ['issue', 'comment', String(number), ...R, '--body', `Closed from the quests page by Noam, ${when}.`]);
  await run('gh', ['issue', 'close', String(number), ...R]);
  await refreshTickets();
}

// ---- the polls ------------------------------------------------------------------------------------------

const timers: NodeJS.Timeout[] = [];

function every(ms: number, label: string, job: () => Promise<void>): void {
  let busy = false;
  const tick = () => {
    if (busy) return; // a pass that overruns the interval is not started again underneath itself
    busy = true;
    job().catch((error: unknown) => console.error(`[Queue] ${label} failed`, { error: String(error) })).finally(() => { busy = false; });
  };
  const timer = setInterval(tick, ms);
  timer.unref?.();
  timers.push(timer);
  tick();
}

export function initializeQueue(): void {
  if (timers.length) return;
  every(15_000, 'tickets', refreshTickets);
  every(2_000, 'live chats', async () => { await refreshLive(); await refreshCursorTabs(); });
  void restoreMirror()
    .then(() => { restored = true; })
    .catch((error: unknown) => console.error('[Queue] restore failed; the order is not stored until a restart reads the mirror', { error: String(error) }));
  void noteRecentTranscripts().catch((error: unknown) => console.error('[Queue] closing lines failed', { error: String(error) }));
}

export function closeQueue(): void {
  timers.splice(0).forEach((t) => clearInterval(t));
}
