import { queueDb } from '@/modules/database/index.js';
import { getCursorTabs } from '@/modules/queue/sources/cursor-tabs.js';
import { getLive, type LiveProcess } from '@/modules/queue/sources/live.js';
import { getPageTabs } from '@/modules/queue/sources/page-tabs.js';
import { getOpenTasks, getTitles, type OpenTask } from '@/modules/queue/sources/transcripts.js';
import { approvalsOf, isTurnInFlight, runningRuns } from '@/shared/runtime-state.js';

/**
 * quests: the chats, as they are. One record per chat this machine knows (the page's sessions, the transcripts
 * read, the running processes, the tabs of Cursor and of the page), joined from the sources on every read. This
 * is the only module that reads the sources; everything else asks the chats.
 *
 * A chat is OPEN when something holds it right now: a running process, or a tab in some place. The places are
 * where a chat can be open: Cursor, the Claude desktop app, a terminal, this page. The queue reads the chats for
 * its entries (the open ones form its first group; a chat held outside the page is read-only in it), and the
 * status dots read their process state. The page's own tabs are the page's place, owned by the page.
 */

export type Place = 'cursor' | 'desktop' | 'terminal' | 'page';

export type Chat = {
  /** Claude Code's session id. */
  sid: string;
  /** The page's id for the chat, when the page knows it. */
  pageSessionId: string | null;
  /** The rename, else Claude's title, else the process's name, else the id. */
  name: string;
  projectPath: string | null;
  /** The transcript file, when the page knows it. */
  transcriptPath: string | null;
  /** The running process, or null. */
  process: LiveProcess | null;
  /** Where the chat is open right now. */
  places: Place[];
  /** The closing line of its last reply, as the chat left it. */
  closingLine: { kind: string; text: string; at: string | null } | null;
  /** /finalize-chat ran in it: the chat is over. */
  finalized: boolean;
};

const PLACE_OF_ENTRYPOINT: Record<string, Place> = { 'claude-vscode': 'cursor', 'claude-desktop': 'desktop', cli: 'terminal' };

export const isOpen = (c: Chat): boolean => c.process !== null || c.places.length > 0;
/** Open somewhere other than the page: the page shows it read-only, since two processes on one transcript break a chat. */
export const isHeldOutside = (c: Chat): boolean => c.places.some((p) => p !== 'page');

/** The tabs of each place, as Claude Code's session ids in tab order. A page tab the page has no row for is Claude's id itself. */
function tabsOf(): Record<'cursor' | 'page', string[]> {
  const byPageId = new Map(queueDb.listClaudeSessions().map((s) => [s.session_id, s.provider_session_id]));
  return { cursor: getCursorTabs(), page: getPageTabs().map((id) => byPageId.get(id) ?? id) };
}

/**
 * A turn this page runs is running from the moment it is sent: the runner's run registry knows it at once, while
 * the CLI writes its registry file only once it has started (a resume can take 20 s). The tab dots read the same
 * runs, so the queue and the tabs agree (Noam, 6 Nov: "the queueue and tabs dont agree on active chats").
 */
function withPageRun(p: LiveProcess | null, sid: string, pageId: string | undefined, run: { sessionId: string; startedAt: number } | undefined): LiveProcess | null {
  // The page's process stays "busy" in the CLI's registry between turns (work-state.ts): the page knows better.
  if (!run) return p?.entrypoint === 'sdk-ts' && p.status === 'busy' && pageId && !isTurnInFlight(pageId) ? { ...p, status: 'idle' } : p;
  const asks = approvalsOf(run.sessionId).length > 0;
  return {
    sessionId: sid, status: asks ? 'waiting' : 'busy', waitingFor: asks ? 'permission prompt' : null,
    entrypoint: p?.entrypoint ?? null, name: p?.name ?? null,
    statusUpdatedAt: Math.max(p?.statusUpdatedAt ?? 0, run.startedAt), startedAt: p?.startedAt ?? run.startedAt,
  };
}

export function getChats(): Map<string, Chat> {
  const live = getLive();
  const pageRuns = new Map(runningRuns().map((r) => [r.sessionId, r]));
  const titles = getTitles();
  const sessions = new Map(queueDb.listClaudeSessions().map((s) => [s.provider_session_id, s]));
  const lines = new Map(queueDb.listChats().map((c) => [c.provider_session_id, c]));
  const tabs = tabsOf();
  const cursor = new Set(tabs.cursor);
  const page = new Set(tabs.page);
  const chats = new Map<string, Chat>();
  for (const sid of new Set([...sessions.keys(), ...lines.keys(), ...live.keys(), ...cursor, ...page])) {
    const s = sessions.get(sid);
    const l = lines.get(sid);
    const p = withPageRun(live.get(sid) ?? null, sid, s?.session_id, s ? pageRuns.get(s.session_id) : undefined);
    const places: Place[] = [];
    if (cursor.has(sid)) places.push('cursor');
    if (page.has(sid)) places.push('page');
    const byProcess = p?.entrypoint ? PLACE_OF_ENTRYPOINT[p.entrypoint] : undefined;
    if (byProcess && !places.includes(byProcess)) places.push(byProcess);
    chats.set(sid, {
      sid,
      pageSessionId: s?.session_id ?? null,
      name: s?.custom_name || titles.get(sid) || p?.name || sid,
      projectPath: s?.project_path ?? null,
      transcriptPath: s?.jsonl_path ?? null,
      process: p,
      places,
      closingLine: l?.line_kind ? { kind: l.line_kind, text: l.line_text ?? '', at: l.line_at } : null,
      finalized: l?.finalized === 1,
    });
  }
  return chats;
}

/** The chats open in a place: its tabs first, in tab order, then the ones a process holds there. */
export function chatsIn(place: Place): Chat[] {
  const chats = getChats();
  const tabs = place === 'cursor' || place === 'page' ? tabsOf()[place] : [];
  const held = [...chats.values()].filter((c) => c.places.includes(place)).map((c) => c.sid);
  return [...new Set([...tabs, ...held])].map((sid) => chats.get(sid)).filter((c): c is Chat => Boolean(c));
}

/**
 * The chat's workers alive now (agents, backgrounded commands, monitors, workflows): launched and not reported,
 * in its current process. A worker lives inside the chat's process: no process, no worker, and a task launched
 * before the current process started died with the process that launched it.
 */
export function liveTasks(c: Chat): OpenTask[] {
  const p = c.process;
  return p ? getOpenTasks(c.sid).filter((t) => !t.startedAt || Date.parse(t.startedAt) >= p.startedAt - 5000) : [];
}

/**
 * The status dots, by the page's id: running (the chat itself works), waiting (it asks), workers (the chat itself
 * is idle while its workers run; Noam, 6 Nov: "i want another circle to show the chat has workers or sub agent
 * that are live but not the main chat").
 */
export function processStates(): Record<string, 'running' | 'waiting' | 'workers'> {
  const states: Record<string, 'running' | 'waiting' | 'workers'> = {};
  for (const c of getChats().values()) {
    if (c.process?.status === 'busy') states[c.pageSessionId ?? c.sid] = 'running';
    else if (c.process?.status === 'waiting') states[c.pageSessionId ?? c.sid] = 'waiting';
    else if (liveTasks(c).length > 0) states[c.pageSessionId ?? c.sid] = 'workers';
  }
  return states;
}
