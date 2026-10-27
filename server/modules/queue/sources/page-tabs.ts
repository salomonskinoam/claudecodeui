import { queueDb } from '@/modules/database/index.js';
import { getTitles, noteTranscript } from '@/modules/queue/sources/transcripts.js';

/**
 * quests priority queue, source: the chats open as tabs in the page, per browser window. Two windows open at
 * once each keep their own tabs; a window that stopped reporting for 30 seconds is gone.
 */

const STALE_MS = 30_000;
const windows = new Map<string, { sids: string[]; at: number }>();

/** A window reports its open tabs (page session ids); each one's transcript is read once for its name and state. */
export function setPageTabs(windowId: string, pageSessionIds: string[]): void {
  const byPageId = new Map(queueDb.listClaudeSessions().map((s) => [s.session_id, s]));
  const rows = pageSessionIds.map((id) => byPageId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  windows.set(windowId, { sids: rows.map((s) => s.provider_session_id), at: Date.now() });
  for (const s of rows) {
    if (s.jsonl_path && !getTitles().has(s.provider_session_id)) void noteTranscript(s.jsonl_path).catch(() => undefined);
  }
}

/** Claude Code session ids of every tab of every live window. */
export function getPageTabs(): string[] {
  for (const [id, w] of windows) if (Date.now() - w.at > STALE_MS) windows.delete(id);
  return [...new Set([...windows.values()].flatMap((w) => w.sids))];
}
