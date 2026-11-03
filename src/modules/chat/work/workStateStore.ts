/**
 * quests: the server's last word on each chat's main state, as the workers panel read it (every 3 seconds). One
 * truth for "is a turn in flight": the page's own memory can go stale when a complete never reaches it, and a
 * stale memory must never block the page from reloading a chat whose transcript moved on (Noam, 2 Nov: ""waiting
 * on you" has nothing in the end of that chat that says it ... it seems out of sync").
 */

const states = new Map<string, { state: string; at: number }>();

export function noteWorkState(sessionId: string, state: string): void {
  states.set(sessionId, { state, at: Date.now() });
}

/** True only when the server said, within the last 10 seconds, that a turn is in flight for the chat. */
export function isServerAnswering(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  const known = states.get(sessionId);
  return Boolean(known && known.state === 'answering' && Date.now() - known.at < 10_000);
}
