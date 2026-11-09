import { getConnection } from '@/modules/database/connection.js';

/** quests: the record of one chat service (user unit quests-chat-<session_id>); see server/modules/chat-hosts. */
export type ChatHostRow = {
  session_id: string;
  unit: string;
  build: string;
  pid: number | null;
  started_at: string;
  turn_open: number;
  turn_started_at: string | null;
  held: number;
  last_event_at: string | null;
  ended_at: string | null;
  wakes: string;
};

/** quests: one listener a chat started with quests/bin/quests-listen. */
export type ListenerRow = {
  id: string;
  session_id: string;
  name: string;
  command: string;
  unit: string;
  log_path: string;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  delivered_at: string | null;
  restarts: number;
};

const now = () => new Date().toISOString();

export const chatHostsDb = {
  /** A chat service starting: a fresh record, the old wake history kept. */
  register(sessionId: string, unit: string, build: string, pid: number): void {
    getConnection()
      .prepare(`INSERT INTO chat_hosts (session_id, unit, build, pid, started_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET unit = excluded.unit, build = excluded.build, pid = excluded.pid,
          started_at = excluded.started_at, turn_open = 0, turn_started_at = NULL, held = 0, last_event_at = NULL,
          ended_at = NULL`)
      .run(sessionId, unit, build, pid, now());
  },

  setTurn(sessionId: string, open: boolean): void {
    getConnection()
      .prepare('UPDATE chat_hosts SET turn_open = ?, turn_started_at = CASE WHEN ? THEN ? ELSE turn_started_at END, last_event_at = ? WHERE session_id = ?')
      .run(open ? 1 : 0, open ? 1 : 0, now(), now(), sessionId);
  },

  setHeld(sessionId: string, held: boolean): void {
    getConnection().prepare('UPDATE chat_hosts SET held = ? WHERE session_id = ?').run(held ? 1 : 0, sessionId);
  },

  touch(sessionId: string): void {
    getConnection().prepare('UPDATE chat_hosts SET last_event_at = ? WHERE session_id = ?').run(now(), sessionId);
  },

  /** The service is gone and nothing of it needs waking. */
  end(sessionId: string): void {
    getConnection().prepare('UPDATE chat_hosts SET ended_at = ?, turn_open = 0, held = 0 WHERE session_id = ?').run(now(), sessionId);
  },

  addWake(sessionId: string, at: string): void {
    const row = this.get(sessionId);
    const wakes = [...(row ? (JSON.parse(row.wakes) as string[]) : []), at];
    getConnection().prepare('UPDATE chat_hosts SET wakes = ? WHERE session_id = ?').run(JSON.stringify(wakes), sessionId);
  },

  get(sessionId: string): ChatHostRow | undefined {
    return getConnection().prepare('SELECT * FROM chat_hosts WHERE session_id = ?').get(sessionId) as ChatHostRow | undefined;
  },

  list(): ChatHostRow[] {
    return getConnection().prepare('SELECT * FROM chat_hosts').all() as ChatHostRow[];
  },
};

export const listenersDb = {
  /** Changes whenever a listener starts or ends. */
  signature(): string {
    return JSON.stringify(getConnection().prepare('SELECT count(*) AS n, max(started_at) AS s, count(ended_at) AS e FROM listeners').get());
  },

  list(): ListenerRow[] {
    return getConnection().prepare('SELECT * FROM listeners').all() as ListenerRow[];
  },

  markDelivered(id: string): void {
    getConnection().prepare('UPDATE listeners SET delivered_at = ? WHERE id = ?').run(now(), id);
  },

  markRestarted(id: string): void {
    getConnection().prepare('UPDATE listeners SET restarts = restarts + 1 WHERE id = ?').run(id);
  },
};
