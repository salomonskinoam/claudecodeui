/**
 * quests priority queue: the chats started from a ticket's tab in the page, by ticket number. The queue counts
 * each as a claim at once, so the ticket's line and the chat become one line as soon as the chat starts, before
 * the chat's own claim comment reaches GitHub (Noam, 6 Nov: "this should then update the ticket status and the
 * chat status in the queue"). Kept in memory for 30 minutes: by then the GitHub claim is there, or the chat did
 * not claim. `sessionId` is the page's id for the chat.
 */
const TTL_MS = 30 * 60_000;
const claims = new Map<number, { sessionId: string; at: number }>();

export function notePageClaim(number: number, sessionId: string, now = Date.now()): void {
  claims.set(number, { sessionId, at: now });
}

export function pageClaims(now = Date.now()): Map<number, { sessionId: string; at: number }> {
  for (const [number, claim] of claims) if (now - claim.at > TTL_MS) claims.delete(number);
  return claims;
}
