/**
 * Session-keyed message store.
 *
 * Holds per-session state in a Map keyed by sessionId.
 * Session switch = change activeSessionId pointer. No clearing. Old data stays.
 * WebSocket handler = store.appendRealtime(msg.sessionId, msg). One line.
 *
 * quests: what the page draws is the session's LEDGER (src/modules/chat/ledger/chatLedger.ts, requirement 52):
 * one append-only list of rows, fed by the transcript reads, the live events, the typed echoes and the
 * streamed reply. This hook only drives it: it requests pages, serializes them, and tells React when the
 * ledger changed. No merge of lists, no removal by text, no sort lives here any more.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/shared/api';
import type { LLMProvider, NormalizedMessage } from '@/shared/types';
import { SESSION_MESSAGES_PAGE_SIZE } from '@/modules/chat/utils/sessionMessagePagination';
import type { SessionMessagesRequestOptions } from '@/modules/chat/utils/sessionMessagePagination';
import {
  appendLive, appendLocal, appendRead, appendStreamDelta, createLedger, cut, endStream, markUndelivered, mergeLedgers,
  UNDELIVERED_AFTER_MS, type Ledger,
} from '@/modules/chat/ledger/chatLedger';
import { loadLedger, openKeysOf, saveLedger } from '@/modules/chat/ledger/ledgerStorage';
import { onRowOpenChange, openKeys, seedRowOpen } from '@/modules/chat/ledger/rowOpen';

// ─── Per-session slot ────────────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'loading' | 'streaming' | 'error';

export type SessionSlot = {
  ledger: Ledger;
  /** Settles once the ledger this viewer stored for the chat has been loaded in (or there was none). */
  ready: Promise<void>;
  /**
   * @internal Serializes history reads for this session so an older-page
   * request calculates its offset after any latest-page refresh completes.
   */
  _historyMutationQueue: Promise<void>;
  status: SessionStatus;
  fetchedAt: number;
  total: number;
  hasMore: boolean;
  /** How many transcript rows, counted from the tail, the ledger holds: the next older page starts here. */
  offset: number;
  tokenUsage: unknown;
};

const EMPTY: NormalizedMessage[] = [];
const SESSION_HISTORY_REQUEST_TIMEOUT_MS = 30_000;
/** A change is saved this long after the last one. */
const SAVE_DEBOUNCE_MS = 1000;
/** The biggest bridge read after a long absence. */
const MAX_BRIDGE_ROWS = 5000;

/** How many of a ledger's rows the transcript has served: where the next older page starts. */
function transcriptRowCount(ledger: Ledger): number {
  const confirmed = new Set<string>();
  for (const [id, rowId] of Object.entries(ledger.alias)) {
    if (!id.startsWith('local_') && !id.startsWith('__stream_')) confirmed.add(rowId);
  }
  return ledger.rows.filter((row) => row.source === 'transcript' || confirmed.has(row.id)).length;
}

function createEmptySlot(sessionId: string): SessionSlot {
  return {
    ledger: createLedger(sessionId),
    ready: Promise.resolve(),
    status: 'idle',
    fetchedAt: 0,
    total: 0,
    hasMore: false,
    offset: 0,
    // `undefined` means "no page has reported usage for this session yet", and
    // every consumer distinguishes that from a reported `null`. Initialising it
    // to `null` made the two indistinguishable, so a provider whose history
    // payload carries no usage looked like one reporting zero — and every
    // history refresh overwrote the value fetched from the token-usage
    // endpoint with it.
    tokenUsage: undefined,
    _historyMutationQueue: Promise.resolve(),
  };
}

type SessionHistoryPage = {
  messages: NormalizedMessage[];
  total: number;
  hasMore: boolean;
  tokenUsage?: unknown;
};

function enqueueHistoryMutation<T>(
  slot: SessionSlot,
  operation: () => Promise<T>,
): Promise<T> {
  // Every read waits for the stored ledger: a page is confirmed against what the viewer saw before.
  const result = slot._historyMutationQueue.then(() => slot.ready).then(operation);
  slot._historyMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function requestSessionHistoryPage(
  sessionId: string,
  options: SessionMessagesRequestOptions,
): Promise<SessionHistoryPage> {
  const response = await api.providers.sessionMessages(sessionId, options, {
    signal: AbortSignal.timeout(SESSION_HISTORY_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = await response.json();
  const data = body?.data ?? body;
  const messages: NormalizedMessage[] = Array.isArray(data.messages) ? data.messages : [];

  return {
    messages,
    total: typeof data.total === 'number' ? data.total : messages.length,
    hasMore: Boolean(data.hasMore),
    ...(
      data && typeof data === 'object' && 'tokenUsage' in data
        ? { tokenUsage: data.tokenUsage }
        : {}
    ),
  };
}

type LatestHistoryRefreshResult = {
  applied: boolean;
  changed: boolean;
  deferred: boolean;
};

type CanRequestHistory = () => boolean;

// Token usage is JSON response data, so compare its serialized value instead
// of treating each freshly parsed response object as a state change.
function hasEquivalentTokenUsage(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function adoptTokenUsage(slot: SessionSlot, page: SessionHistoryPage): boolean {
  if (page.tokenUsage === undefined || hasEquivalentTokenUsage(page.tokenUsage, slot.tokenUsage)) return false;
  slot.tokenUsage = page.tokenUsage;
  return true;
}

/**
 * The latest page into the ledger. Known rows are confirmed, new rows land at the end. A page with no row in
 * common with a non-empty ledger (the page was away for more than a page of rows) is bridged: one bigger read
 * sized by how much the transcript grew, then, if still nothing in common, a gap note and the page as a block.
 */
async function refreshLatestSlotFromServer(
  sessionId: string,
  slot: SessionSlot,
  limit: number,
  canRequest: CanRequestHistory = () => true,
): Promise<LatestHistoryRefreshResult> {
  if (!canRequest()) {
    return { applied: false, changed: false, deferred: true };
  }
  const ledger = slot.ledger;
  const epoch = ledger.epoch;
  const knownTotal = ledger.transcriptTotal;
  let page = await requestSessionHistoryPage(sessionId, { limit, offset: 0 });
  let changed = adoptTokenUsage(slot, page);
  let result = appendRead(ledger, page.messages, { direction: 'latest', epoch, batch: ledger.rows.length === 0, total: page.total, now: Date.now() });
  if (!result.stale && !result.overlapped && page.hasMore) {
    const bridgeLimit = Math.min(MAX_BRIDGE_ROWS, Math.max(limit, page.total - knownTotal + limit));
    if (!canRequest()) return { applied: false, changed, deferred: true };
    page = await requestSessionHistoryPage(sessionId, { limit: bridgeLimit, offset: 0 });
    result = appendRead(ledger, page.messages, { direction: 'latest', epoch, batch: true, total: page.total, now: Date.now() });
    if (!result.stale && !result.overlapped) {
      console.warn(`[SessionStore] no row in common after a ${bridgeLimit}-row read of ${sessionId}; drawing a gap`);
      result = appendRead(ledger, page.messages, { direction: 'latest', epoch, batch: true, bridge: true, total: page.total, now: Date.now() });
    }
  } else if (!result.stale && !result.overlapped) {
    // The whole transcript came back and nothing in it is known: the chat was rewritten under the page.
    result = appendRead(ledger, page.messages, { direction: 'latest', epoch, batch: true, bridge: true, total: page.total, now: Date.now() });
  }
  if (result.stale) {
    return { applied: false, changed, deferred: false };
  }
  slot.total = page.total;
  slot.offset = Math.max(slot.offset + result.appended, page.messages.length);
  if (page.messages.length >= slot.offset || !page.hasMore) slot.hasMore = page.hasMore;
  slot.fetchedAt = Date.now();
  return { applied: true, changed: changed || result.changed, deferred: false };
}

// ─── Stale threshold ─────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 30_000;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSessionStore() {
  const storeRef = useRef(new Map<string, SessionSlot>());
  const activeSessionIdRef = useRef<string | null>(null);
  // Bump to force re-render — only when the active session's data changes.
  // Session ids are stable for the whole conversation lifetime (the backend
  // allocates them before the first send), so slots are keyed directly with
  // no alias/redirect indirection.
  const [, setTick] = useState(0);
  // The ledger is saved per viewer (requirement 52), a second after its last change and when the page hides.
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveNow = useCallback((sessionId: string) => {
    const timer = saveTimersRef.current.get(sessionId);
    if (timer) clearTimeout(timer);
    saveTimersRef.current.delete(sessionId);
    const slot = storeRef.current.get(sessionId);
    if (slot && slot.ledger.rows.length > 0) void saveLedger(slot.ledger, openKeysOf(slot.ledger, openKeys()));
  }, []);
  const scheduleSave = useCallback((sessionId: string) => {
    const timers = saveTimersRef.current;
    const timer = timers.get(sessionId);
    if (timer) clearTimeout(timer);
    timers.set(sessionId, setTimeout(() => saveNow(sessionId), SAVE_DEBOUNCE_MS));
  }, [saveNow]);
  const notify = useCallback((sessionId: string) => {
    scheduleSave(sessionId);
    if (sessionId === activeSessionIdRef.current) {
      setTick(n => n + 1);
    }
  }, [scheduleSave]);
  useEffect(() => {
    const flush = () => { for (const sessionId of [...saveTimersRef.current.keys()]) saveNow(sessionId); };
    window.addEventListener('pagehide', flush);
    // A click on a row (its open state lives beside the ledger) is saved with the chat it belongs to.
    const unsubscribe = onRowOpenChange(() => { if (activeSessionIdRef.current) scheduleSave(activeSessionIdRef.current); });
    return () => { window.removeEventListener('pagehide', flush); unsubscribe(); };
  }, [saveNow, scheduleSave]);

  const setActiveSession = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
  }, []);

  const getSlot = useCallback((sessionId: string): SessionSlot => {
    const store = storeRef.current;
    if (!store.has(sessionId)) {
      const slot = createEmptySlot(sessionId);
      // What this viewer saw of the chat before: loaded first, so a reload draws the chat as it was. Rows that
      // arrive meanwhile are merged after it in their order.
      slot.ready = loadLedger(sessionId).then((stored) => {
        if (!stored) return;
        slot.ledger = slot.ledger.rows.length === 0 ? stored : mergeLedgers(stored, slot.ledger);
        slot.offset = Math.max(slot.offset, transcriptRowCount(slot.ledger));
        seedRowOpen(Object.keys(stored.open));
        if (sessionId === activeSessionIdRef.current) setTick(n => n + 1);
      }).catch(() => undefined);
      store.set(sessionId, slot);
    }
    return store.get(sessionId)!;
  }, []);

  /**
   * Fetch messages from the provider sessions endpoint into the ledger.
   *
   * Provider and project metadata are resolved server-side from `sessionId`.
   * The endpoint returns the standard `{ success, data }` envelope. A page from
   * offset 0 is the latest page (whatever its size, up to the whole transcript);
   * any other offset is an older page.
   */
  const fetchFromServer = useCallback(async (
    sessionId: string,
    opts: {
      limit?: number | null;
      offset?: number;
      canRequest?: CanRequestHistory;
    } = {},
  ) => {
    const slot = getSlot(sessionId);
    slot.status = 'loading';
    notify(sessionId);

    return enqueueHistoryMutation(slot, async () => {
      const { canRequest = () => true, ...requestOptions } = opts;
      if (!canRequest()) {
        slot.status = 'idle';
        notify(sessionId);
        return null;
      }

      try {
        const ledger = slot.ledger;
        const epoch = ledger.epoch;
        const data = await requestSessionHistoryPage(sessionId, requestOptions);
        const older = (requestOptions.offset ?? 0) > 0;
        const result = appendRead(ledger, data.messages, {
          direction: older ? 'older' : 'latest',
          epoch,
          batch: true,
          // The whole transcript, or the first page: nothing to bridge against.
          bridge: !older,
          total: data.total,
          now: Date.now(),
        });
        if (!result.stale) {
          slot.total = data.total;
          slot.offset = older
            ? slot.offset + result.prepended
            : Math.max(slot.offset + result.appended, data.messages.length);
          slot.hasMore = data.hasMore;
          slot.fetchedAt = Date.now();
        }
        slot.status = 'idle';
        adoptTokenUsage(slot, data);

        notify(sessionId);
        return slot;
      } catch (error) {
        console.error(`[SessionStore] fetch failed for ${sessionId}:`, error);
        slot.status = 'error';
        notify(sessionId);
        return slot;
      }
    });
  }, [getSlot, notify]);

  /**
   * Load older (paginated) messages: a block before the ledger's first row.
   */
  const fetchMore = useCallback(async (
    sessionId: string,
    opts: {
      limit?: number;
      canRequest?: CanRequestHistory;
    } = {},
  ) => {
    const slot = getSlot(sessionId);
    return enqueueHistoryMutation(slot, async () => {
      let prependedCount = 0;
      let changed = false;
      const canRequest = opts.canRequest ?? (() => true);
      if (!slot.hasMore || !canRequest()) return { slot, prependedCount };

      try {
        // The offset counts from the tail, which grows while the chat works, so
        // an older page can come back made of rows the ledger holds already.
        // Those only confirm; the offset moves past them and the read is retried once.
        for (let attempt = 0; attempt < 2 && slot.hasMore; attempt++) {
          if (!canRequest()) break;
          const ledger = slot.ledger;
          const epoch = ledger.epoch;
          const data = await requestSessionHistoryPage(sessionId, {
            limit: opts.limit ?? SESSION_MESSAGES_PAGE_SIZE,
            offset: slot.offset,
          });
          const result = appendRead(ledger, data.messages, { direction: 'older', epoch, batch: true, now: Date.now() });
          if (result.stale) break;
          slot.total = data.total;
          changed = changed || result.changed || adoptTokenUsage(slot, data);
          if (result.prepended === 0 && data.hasMore && data.messages.length > 0) {
            slot.offset += data.messages.length;
            continue;
          }
          slot.hasMore = data.hasMore;
          slot.offset += result.prepended;
          prependedCount = result.prepended;
          break;
        }

        if (changed) notify(sessionId);
        return { slot, prependedCount };
      } catch (error) {
        console.error(`[SessionStore] fetchMore failed for ${sessionId}:`, error);
        if (changed) notify(sessionId);
        return { slot, prependedCount };
      }
    });
  }, [getSlot, notify]);

  /**
   * An already-sent message was edited: the rows it replaces are marked, never
   * removed. Runs on every subscribed client, not just the one that made the edit.
   */
  const truncateAt = useCallback((sessionId: string, anchorId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return;
    if (cut(slot.ledger, anchorId)) notify(sessionId);
  }, [notify]);

  /**
   * Append a realtime (WebSocket) message, or a typed echo (`local_` id), to the
   * session's ledger. Works regardless of which session is actively viewed.
   */
  const appendRealtime = useCallback((sessionId: string, msg: NormalizedMessage) => {
    const slot = getSlot(sessionId);
    const now = Date.now();
    if (msg.id.startsWith('local_')) {
      if (appendLocal(slot.ledger, msg, now)) {
        notify(sessionId);
        // A typed message the transcript has not confirmed after a minute is "not delivered".
        setTimeout(() => {
          if (markUndelivered(slot.ledger, Date.now())) notify(sessionId);
        }, UNDELIVERED_AFTER_MS + 1000);
      }
      return;
    }
    if (appendLive(slot.ledger, msg, now)) notify(sessionId);
  }, [getSlot, notify]);

  /**
   * Refreshes the latest page into the ledger (see refreshLatestSlotFromServer).
   */
  const refreshLatestFromServer = useCallback(async (
    sessionId: string,
    opts: {
      limit?: number;
      canRequest?: CanRequestHistory;
    } = {},
  ) => {
    const slot = getSlot(sessionId);

    return enqueueHistoryMutation(slot, async () => {
      try {
        const result = await refreshLatestSlotFromServer(
          sessionId,
          slot,
          opts.limit ?? SESSION_MESSAGES_PAGE_SIZE,
          opts.canRequest,
        );
        if (result.changed) notify(sessionId);
        return { slot, ...result };
      } catch (error) {
        console.error(`[SessionStore] latest refresh failed for ${sessionId}:`, error);
        return { slot, applied: false, changed: false, deferred: false };
      }
    });
  }, [getSlot, notify]);

  /**
   * Check if a session's data is stale (>30s old).
   */
  const isStale = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return true;
    return Date.now() - slot.fetchedAt > STALE_THRESHOLD_MS;
  }, []);

  /**
   * The streamed reply so far: one row that grows in place.
   */
  const updateStreaming = useCallback((sessionId: string, accumulatedText: string, msgProvider: LLMProvider) => {
    const slot = getSlot(sessionId);
    if (appendStreamDelta(slot.ledger, accumulatedText, msgProvider, Date.now())) notify(sessionId);
  }, [getSlot, notify]);

  /**
   * Finalize streaming: the streamed row becomes the reply's text row, and what waited for it lands.
   */
  const finalizeStreaming = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return;
    if (endStream(slot.ledger, Date.now())) notify(sessionId);
  }, [notify]);

  /**
   * The ledger's rows for a session, in render order.
   */
  const getMessages = useCallback((sessionId: string): NormalizedMessage[] => {
    return storeRef.current.get(sessionId)?.ledger.rows ?? EMPTY;
  }, []);

  /**
   * Get session slot (for status, pagination info, etc.).
   */
  const getSessionSlot = useCallback((sessionId: string): SessionSlot | undefined => {
    return storeRef.current.get(sessionId);
  }, []);

  return useMemo(() => ({
    fetchFromServer,
    fetchMore,
    appendRealtime,
    truncateAt,
    refreshLatestFromServer,
    setActiveSession,
    isStale,
    updateStreaming,
    finalizeStreaming,
    getMessages,
    getSessionSlot,
  }), [
    fetchFromServer, fetchMore, appendRealtime, truncateAt, refreshLatestFromServer,
    setActiveSession, isStale, updateStreaming, finalizeStreaming,
    getMessages, getSessionSlot,
  ]);
}

/** Full store API returned by useSessionStore; chat hooks take it as a parameter. */
export type SessionStore = ReturnType<typeof useSessionStore>;
