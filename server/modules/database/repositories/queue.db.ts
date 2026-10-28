import { getConnection } from '@/modules/database/connection.js';

export type QueueChatRow = {
  provider_session_id: string;
  line_kind: string | null;
  line_text: string | null;
  line_at: string | null;
  finalized: number;
};

export type QueueSessionRow = {
  session_id: string;
  provider_session_id: string;
  custom_name: string | null;
  project_path: string | null;
  jsonl_path: string | null;
};

/** quests priority queue: the stored order, the pin, the dismissals, and the chats' closing lines. */
type StateKey = 'order' | 'latch' | 'dismissed';

export const queueDb = {
  getState<T>(key: StateKey): T | undefined {
    const row = getConnection().prepare('SELECT value FROM queue_state WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  },

  setState(key: StateKey, value: unknown): void {
    getConnection()
      .prepare(`INSERT INTO queue_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
      .run(key, JSON.stringify(value));
  },

  setChat(row: QueueChatRow): void {
    getConnection()
      .prepare(`INSERT INTO queue_chats (provider_session_id, line_kind, line_text, line_at, finalized)
        VALUES (@provider_session_id, @line_kind, @line_text, @line_at, @finalized)
        ON CONFLICT(provider_session_id) DO UPDATE SET line_kind = excluded.line_kind, line_text = excluded.line_text,
          line_at = excluded.line_at, finalized = excluded.finalized`)
      .run(row);
  },

  listChats(): QueueChatRow[] {
    return getConnection().prepare('SELECT * FROM queue_chats').all() as QueueChatRow[];
  },

  /** Claude sessions of the page, the ones changed in the last `days` first. */
  listClaudeSessions(days?: number): QueueSessionRow[] {
    const since = days === undefined ? '' : `AND julianday(COALESCE(updated_at, created_at)) > julianday('now', '-${days} days')`;
    return getConnection()
      .prepare(`SELECT session_id, provider_session_id, custom_name, project_path, jsonl_path FROM sessions
        WHERE provider = 'claude' AND provider_session_id IS NOT NULL ${since}`)
      .all() as QueueSessionRow[];
  },
};
