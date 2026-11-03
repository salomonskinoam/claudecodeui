// quests: 100 (was 20): fewer, bigger loads of older history, each further ahead of a fast scroll up.
export const SESSION_MESSAGES_PAGE_SIZE = 100;

export type SessionMessagesRequestOptions = {
  limit?: number | null;
  offset?: number;
};

// The unified session-history URL is declared with the rest of the endpoints;
// it is re-exported here because the pagination tests cover its shape.
export { sessionMessagesUrl as buildSessionMessagesUrl } from '@/shared/api';

// quests: the page merges (latest and older pages onto a cached list, the bridge planning, the time-boundary
// checks) are gone: the chat's ledger (src/modules/chat/ledger/chatLedger.ts) confirms known rows by id and
// appends the rest, so there is nothing to merge (requirement 52).
