import { queueDb } from '@/modules/database/index.js';
import { getCursorTabs } from '@/modules/queue/sources/cursor-tabs.js';
import { getLive, type LiveProcess } from '@/modules/queue/sources/live.js';
import { getPageTabs } from '@/modules/queue/sources/page-tabs.js';
import { getTitles } from '@/modules/queue/sources/transcripts.js';

/**
 * quests: the chats, as they are. One record per chat this machine knows (the page's sessions, the transcripts
 * read, the running processes, the tabs of Cursor and of the page), joined from the sources on every read.
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

export function getChats(): Map<string, Chat> {
  const live = getLive();
  const titles = getTitles();
  const sessions = new Map(queueDb.listClaudeSessions().map((s) => [s.provider_session_id, s]));
  const lines = new Map(queueDb.listChats().map((c) => [c.provider_session_id, c]));
  const cursor = new Set(getCursorTabs());
  const page = new Set(getPageTabs());
  const chats = new Map<string, Chat>();
  for (const sid of new Set([...sessions.keys(), ...lines.keys(), ...live.keys(), ...cursor, ...page])) {
    const s = sessions.get(sid);
    const l = lines.get(sid);
    const p = live.get(sid) ?? null;
    const places: Place[] = [];
    if (cursor.has(sid)) places.push('cursor');
    if (page.has(sid)) places.push('page');
    const byProcess = p?.entrypoint ? PLACE_OF_ENTRYPOINT[p.entrypoint] : undefined;
    if (byProcess && !places.includes(byProcess)) places.push(byProcess);
    chats.set(sid, {
      sid,
      pageSessionId: s?.session_id ?? null,
      name: titles.get(sid) ?? s?.custom_name ?? p?.name ?? sid,
      projectPath: s?.project_path ?? null,
      process: p,
      places,
      closingLine: l?.line_kind ? { kind: l.line_kind, text: l.line_text ?? '', at: l.line_at } : null,
      finalized: l?.finalized === 1,
    });
  }
  return chats;
}

/** The chats with a running process, by the page's id: what the status dots show. */
export function processStates(): Record<string, 'running' | 'waiting'> {
  const states: Record<string, 'running' | 'waiting'> = {};
  for (const c of getChats().values()) {
    if (c.process?.status === 'busy') states[c.pageSessionId ?? c.sid] = 'running';
    else if (c.process?.status === 'waiting') states[c.pageSessionId ?? c.sid] = 'waiting';
  }
  return states;
}
