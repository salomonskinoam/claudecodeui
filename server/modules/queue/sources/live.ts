import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** quests priority queue, source: the running Claude Code processes, from its registry ~/.claude/sessions/*.json. */

export type LiveProcess = {
  sessionId: string;
  status: 'busy' | 'waiting' | 'idle';
  waitingFor: string | null;
  entrypoint: string | null;
  name: string | null;
  statusUpdatedAt: number;
  /** When the process started (epoch ms); with two processes on one chat, the older start. */
  startedAt: number;
};

const STATUS_RANK = { busy: 2, waiting: 1, idle: 0 } as const;

let live = new Map<string, LiveProcess>();
export const getLive = () => live;
/** A Claude Code process runs this session right now (in Cursor, the desktop app, a terminal or the page). */
export const hasLiveProcess = (sessionId: string): boolean => live.has(sessionId);

/** When one chat has two processes, the strongest state wins (busy over waiting over idle). */
export async function refreshLive(): Promise<void> {
  const dir = path.join(os.homedir(), '.claude', 'sessions');
  const next = new Map<string, LiveProcess>();
  for (const file of await fs.readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    let entry;
    try {
      entry = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
      process.kill(entry.pid, 0);
    } catch {
      continue; // the process exited, or is rewriting its file right now
    }
    if (!entry.sessionId || !(entry.status in STATUS_RANK)) continue;
    const p: LiveProcess = {
      sessionId: entry.sessionId,
      status: entry.status,
      waitingFor: entry.waitingFor ?? null,
      entrypoint: entry.entrypoint ?? null,
      name: entry.name ?? null,
      statusUpdatedAt: entry.statusUpdatedAt ?? entry.updatedAt ?? 0,
      startedAt: entry.startedAt ?? 0,
    };
    const had = next.get(p.sessionId);
    if (!had || STATUS_RANK[p.status] > STATUS_RANK[had.status]) next.set(p.sessionId, { ...p, startedAt: Math.min(p.startedAt, had?.startedAt ?? p.startedAt) });
    else had.startedAt = Math.min(had.startedAt, p.startedAt);
  }
  live = next;
}
