import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

/**
 * quests priority queue, source: the chats open as Claude tabs in Cursor, read from Cursor's saved workspace
 * state (read-only). In tab order, the workspace changed most recently first.
 */

let cursorTabs: string[] = [];
export const getCursorTabs = () => cursorTabs;

export async function refreshCursorTabs(): Promise<void> {
  const base = path.join(os.homedir(), '.config', 'Cursor', 'User', 'workspaceStorage');
  const week = Date.now() - 7 * 24 * 3600 * 1000;
  const found: Array<{ at: number; sids: string[] }> = [];
  for (const dir of await fs.readdir(base)) {
    const file = path.join(base, dir, 'state.vscdb');
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.mtimeMs < week) continue;
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'Anthropic.claude-code'").get() as { value: string | Buffer } | undefined;
      const tabs: Array<{ sessionId?: string }> = row ? JSON.parse(String(row.value)).panelTabSessions ?? [] : [];
      found.push({ at: stat.mtimeMs, sids: tabs.map((t) => t.sessionId).filter((s): s is string => Boolean(s)) });
    } finally {
      db.close();
    }
  }
  cursorTabs = [...new Set(found.sort((a, b) => b.at - a.at).flatMap((w) => w.sids))];
}
