import express from 'express';
import type { Request, Response } from 'express';

import { getConnection } from '@/modules/database/index.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

/**
 * quests (requirement 120): the page's event log, for debugging. One table, ui_events; rows older than a week are
 * deleted. The server logs what it sees change (a chat's live state and queue state, the manager's actions, the
 * listeners, the About side chat), the page logs what it does (beeps, dots, reconnects, loads), the stop hook logs
 * the replies it sends back. Read it with quests/bin/quests-events. Noam, 11 Nov: "we need to keep an event log for
 * this ui mostly for debugging"; "you can hola a history of up to a week that's enough".
 */

const WEEK_MS = 7 * 24 * 3600_000;

export function logEvent(source: string, kind: string, sessionId: string | null, detail: Record<string, unknown> = {}): void {
  getConnection()
    .prepare('INSERT INTO ui_events (at, source, kind, session_id, detail) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), source, kind, sessionId, JSON.stringify(detail));
}

export function pruneEvents(): void {
  getConnection().prepare('DELETE FROM ui_events WHERE at < ?').run(new Date(Date.now() - WEEK_MS).toISOString());
}

/**
 * Logs what changed since the last call, per chat: `states` maps a chat (page session id, or a ticket's key) to its
 * facts, such as its live state and its queue state. A fact that appears, changes or goes is one row.
 */
let last: Record<string, Record<string, string>> | null = null;
export function noteStates(states: Record<string, Record<string, string>>): void {
  if (last) {
    for (const id of new Set([...Object.keys(last), ...Object.keys(states)])) {
      const before = last[id] ?? {};
      const after = states[id] ?? {};
      const changes: Record<string, unknown> = {};
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (before[k] !== after[k]) changes[k] = { from: before[k] ?? null, to: after[k] ?? null };
      }
      if (Object.keys(changes).length > 0) logEvent('server', 'state', id.startsWith('ticket:') ? null : id, { chat: id, ...changes });
    }
  }
  last = states;
}

const router = express.Router();

// The page's own events: { kind, sessionId?, detail? }.
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { kind, sessionId, detail } = req.body ?? {};
  if (typeof kind !== 'string' || !kind) throw new AppError('kind is required.', { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
  logEvent('page', kind, typeof sessionId === 'string' ? sessionId : null, detail && typeof detail === 'object' ? detail : {});
  res.json(createApiSuccessResponse(null));
}));

export const eventRoutes = router;
