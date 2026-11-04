/**
 * quests: the server's word on each chat's work (GET /api/quests/work/state/<session>, every 3 seconds while
 * anything on the page shows that chat): its main state and its live workers. One read per chat, shared by the
 * workers panel and the strip of running work.
 *   isServerAnswering  one truth for "is a turn in flight": the page's own memory can go stale when a complete
 *                      never reaches it (Noam, 2 Nov: ""waiting on you" has nothing in the end of that chat that
 *                      says it ... it seems out of sync")
 *   useServerWorkers   the live workers' task ids (requirement 40: only live ones); the strip shows nothing else
 *                      (Noam, 4 Nov, of an agent killed the day before and still shown as running: "the agent
 *                      running popup is very likely wrong or not updated")
 */

import { useEffect, useSyncExternalStore } from 'react';

import { authenticatedFetch } from '@/shared/api';
import type { WorkState } from '@/modules/chat/work/WorkersPanel';

type Entry = { state: WorkState | null; ids: Set<string> | null; at: number; users: number; timer: number | null };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const entryOf = (sid: string): Entry => {
  let e = entries.get(sid);
  if (!e) { e = { state: null, ids: null, at: 0, users: 0, timer: null }; entries.set(sid, e); }
  return e;
};

/** Records what the server said about a chat (the poll; tests). */
export function setWorkState(sessionId: string, state: WorkState): void {
  const e = entryOf(sessionId);
  e.state = state;
  e.at = Date.now();
  const ids = state.workers.map((w) => w.taskId);
  if (!(e.ids && e.ids.size === ids.length && ids.every((id) => e.ids!.has(id)))) e.ids = new Set(ids);
  listeners.forEach((l) => l());
}

async function load(sessionId: string): Promise<void> {
  const response = await authenticatedFetch(`/api/quests/work/state/${encodeURIComponent(sessionId)}`);
  if (!response.ok) return;
  try {
    setWorkState(sessionId, (await response.json()) as WorkState);
  } catch {
    /* an older server: nothing is known */
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The server's work state of a chat, polled while some component uses it; null until the server has said. */
export function useWorkState(sessionId: string | null): WorkState | null {
  useEffect(() => {
    if (!sessionId) return undefined;
    const e = entryOf(sessionId);
    e.users += 1;
    if (e.users === 1) {
      // A failed read keeps what the server said last.
      const poll = () => { load(sessionId).catch(() => {}); };
      poll();
      e.timer = window.setInterval(poll, 3000);
    }
    return () => {
      e.users -= 1;
      if (e.users === 0 && e.timer !== null) { window.clearInterval(e.timer); e.timer = null; }
    };
  }, [sessionId]);
  return useSyncExternalStore(subscribe, () => (sessionId ? entries.get(sessionId)?.state ?? null : null));
}

/** The server's live workers of a chat, by task id; null until the server has said. */
export function useServerWorkers(sessionId: string | null): Set<string> | null {
  useWorkState(sessionId);
  return useSyncExternalStore(subscribe, () => (sessionId ? entries.get(sessionId)?.ids ?? null : null));
}

/** True only when the server said, within the last 10 seconds, that a turn is in flight for the chat. */
export function isServerAnswering(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  const e = entries.get(sessionId);
  return Boolean(e?.state && e.state.main.state === 'answering' && Date.now() - e.at < 10_000);
}
