import type { ServerEvent } from '@/shared/types';

/**
 * quests: where a chat's live replay stands: the highest `seq` seen, and the run it counts in. The server starts
 * `seq` at 1 for every run of a session, so a position from an earlier run must never be sent against a later
 * one: the server would replay from the wrong place (requirement 52, race resistance).
 */
export type ReplayPosition = { runId?: string; seq: number };

/** The position after one sequenced event, or null when the event moves nothing. */
export function advanceReplayPosition(known: ReplayPosition | undefined, event: Pick<ServerEvent, 'seq' | 'runId'>): ReplayPosition | null {
  if (typeof event.seq !== 'number') return null;
  const runId = typeof event.runId === 'string' ? event.runId : undefined;
  if (!known || known.runId !== runId) return { runId, seq: event.seq };
  return event.seq > known.seq ? { runId, seq: event.seq } : null;
}

/** One entry of `chat.subscribe`'s `sessions`. */
export function subscribeTarget(sessionId: string, known: ReplayPosition | undefined): { sessionId: string; lastSeq: number; runId?: string } {
  return { sessionId, lastSeq: known?.seq ?? 0, ...(known?.runId ? { runId: known.runId } : {}) };
}
