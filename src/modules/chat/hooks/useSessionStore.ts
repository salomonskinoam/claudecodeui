/**
 * Session-keyed message store.
 *
 * Holds per-session state in a Map keyed by sessionId.
 * Session switch = change activeSessionId pointer. No clearing. Old data stays.
 *
 * quests: the page draws the transcript (requirement 52; Noam, 9 Nov: "there is a ssot. just display it"). A slot
 * holds a window of the server's rows placed by position (src/modules/chat/transcript/transcriptWindow.ts), the
 * typed messages and notices until the transcript has them, and the reply the page streams. A browser cache of the
 * last window shows a chat at once and is overwritten by the next server read (transcriptCache.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/shared/api';
import type { LLMProvider, NormalizedMessage } from '@/shared/types';
import { SESSION_MESSAGES_PAGE_SIZE } from '@/modules/chat/utils/sessionMessagePagination';
import type { SessionMessagesRequestOptions } from '@/modules/chat/utils/sessionMessagePagination';
import {
  EMPTY_WINDOW, placeLatest, placeOlder, settleNotes, view, windowEnd, type Note, type TranscriptWindow,
} from '@/modules/chat/transcript/transcriptWindow';
import { loadCachedChat, openKeysOf, saveCachedChat } from '@/modules/chat/transcript/transcriptCache';
import { onRowOpenChange, openKeys, seedRowOpen } from '@/modules/chat/ledger/rowOpen';

// ─── Per-session slot ────────────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'loading' | 'streaming' | 'error';

export type SessionSlot = {
  window: TranscriptWindow;
  /** Typed messages and notices, until the transcript has them. */
  notes: Note[];
  /** The reply the page streams; it goes at the first read after the turn ends. */
  stream: NormalizedMessage | null;
  streamEnded: boolean;
  /** What the page draws, rebuilt on every change. */
  view: NormalizedMessage[];
  /** Settles once the cached window has been drawn (or there was none). */
  ready: Promise<void>;
  /** @internal Serializes history reads for this session. */
  _historyMutationQueue: Promise<void>;
  /** False until the first server read of this page's life: that read also refreshes the cached rows. */
  read: boolean;
  status: SessionStatus;
  fetchedAt: number;
  /** The transcript's row count at the last read. */
  total: number;
  hasMore: boolean;
  /** How many rows, counted from the transcript's end, the window holds: the next older page starts here. */
  offset: number;
  tokenUsage: unknown;
};

const EMPTY: NormalizedMessage[] = [];
const SESSION_HISTORY_REQUEST_TIMEOUT_MS = 30_000;
/** A change is cached this long after the last one. */
const SAVE_DEBOUNCE_MS = 1000;
/** The biggest read that fills a hole after a long absence; past it the window starts over. */
const MAX_FILL_ROWS = 5000;
/** The first read of a cached chat re-reads at most this many of its rows. */
const MAX_REFRESH_ROWS = 1000;
/** A live event makes the page read the transcript, at most this often. */
const LIVE_READ_MS = 300;
/** A typed message the transcript does not have after this long is "not delivered". */
const UNDELIVERED_AFTER_MS = 60_000;

function createEmptySlot(): SessionSlot {
  return {
    window: EMPTY_WINDOW,
    notes: [],
    stream: null,
    streamEnded: false,
    view: EMPTY,
    ready: Promise.resolve(),
    read: false,
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

/** The window's new shape: its counts, the notes the transcript took over, and what the page draws. */
function rebuild(slot: SessionSlot): void {
  slot.offset = slot.total - slot.window.start;
  slot.hasMore = slot.window.start > 0;
  slot.notes = settleNotes(slot.window, slot.notes);
  slot.view = view(slot.window, slot.notes, slot.stream);
}

/** Rows equal to the ones they replace keep their objects, so React redraws only what changed. */
function keepSame(before: TranscriptWindow, after: TranscriptWindow): TranscriptWindow {
  const offset = after.start - before.start;
  let same = after.rows.length === before.rows.length && offset === 0;
  const rows = after.rows.map((m, i) => {
    const old = before.rows[i + offset];
    if (old && old.id === m.id && JSON.stringify(old) === JSON.stringify(m)) return old;
    same = false;
    return m;
  });
  return same ? before : { start: after.start, rows };
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
  // Every read waits for the cached window, so the read is placed over it.
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
 * Reads the newest rows and places them over the window by position. A read that does not reach the window (the
 * page was away longer than one read) is followed by one read that fills the hole, up to MAX_FILL_ROWS rows; past
 * that, or if the transcript shrank, the window starts over from the newest rows.
 */
async function refreshLatestSlotFromServer(
  sessionId: string,
  slot: SessionSlot,
  limit: number | null,
  canRequest: CanRequestHistory = () => true,
): Promise<LatestHistoryRefreshResult> {
  if (!canRequest()) {
    return { applied: false, changed: false, deferred: true };
  }
  const first = !slot.read && limit !== null ? Math.max(limit, Math.min(slot.window.rows.length, MAX_REFRESH_ROWS)) : limit;
  let page = await requestSessionHistoryPage(sessionId, { limit: first, offset: 0 });
  let placed = placeLatest(slot.window, page.messages, page.total);
  if (!placed) {
    const fill = page.total - slot.window.start;
    if (fill <= MAX_FILL_ROWS) {
      if (!canRequest()) return { applied: false, changed: false, deferred: true };
      page = await requestSessionHistoryPage(sessionId, { limit: fill, offset: 0 });
      placed = placeLatest(slot.window, page.messages, page.total);
    }
    placed ??= { start: page.total - page.messages.length, rows: page.messages };
  }
  const before = slot.window;
  slot.window = keepSame(before, placed);
  slot.read = true;
  slot.total = page.total;
  slot.fetchedAt = Date.now();
  const streamGone = slot.streamEnded && slot.stream !== null;
  if (streamGone) { slot.stream = null; slot.streamEnded = false; }
  const notesBefore = slot.notes.length;
  rebuild(slot);
  const changed = adoptTokenUsage(slot, page) || slot.window !== before || streamGone || slot.notes.length !== notesBefore;
  return { applied: true, changed, deferred: false };
}

// ─── Stale threshold ─────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 30_000;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSessionStore() {
  const storeRef = useRef(new Map<string, SessionSlot>());
  const activeSessionIdRef = useRef<string | null>(null);
  // Bump to force re-render — only when the active session's data changes.
  const [, setTick] = useState(0);
  // The cache is overwritten a second after the last change and when the page hides.
  const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saveNow = useCallback((sessionId: string) => {
    const timer = saveTimersRef.current.get(sessionId);
    if (timer) clearTimeout(timer);
    saveTimersRef.current.delete(sessionId);
    const slot = storeRef.current.get(sessionId);
    if (slot && slot.window.rows.length > 0) {
      void saveCachedChat({ sessionId, start: slot.window.start, rows: slot.window.rows, open: openKeysOf(slot.view, openKeys()) });
    }
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
    // A click on a row is cached with the chat it belongs to.
    const unsubscribe = onRowOpenChange(() => { if (activeSessionIdRef.current) scheduleSave(activeSessionIdRef.current); });
    return () => { window.removeEventListener('pagehide', flush); unsubscribe(); };
  }, [saveNow, scheduleSave]);

  const setActiveSession = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
  }, []);

  const getSlot = useCallback((sessionId: string): SessionSlot => {
    const store = storeRef.current;
    if (!store.has(sessionId)) {
      const slot = createEmptySlot();
      // The cached window is drawn at once; the first server read is placed over it and overwrites it.
      slot.ready = loadCachedChat(sessionId).then((cached) => {
        if (!cached || slot.window.rows.length > 0) return;
        slot.window = { start: cached.start, rows: cached.rows };
        slot.total = windowEnd(slot.window);
        rebuild(slot);
        seedRowOpen(cached.open);
        if (sessionId === activeSessionIdRef.current) setTick(n => n + 1);
      }).catch(() => undefined);
      store.set(sessionId, slot);
    }
    return store.get(sessionId)!;
  }, []);

  /**
   * Reads from the provider sessions endpoint. A read from offset 0 is the newest rows (whatever its size, up to
   * the whole transcript); any other offset is an older page.
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
        const offset = requestOptions.offset ?? 0;
        if (offset > 0) {
          const data = await requestSessionHistoryPage(sessionId, requestOptions);
          slot.window = placeOlder(slot.window, data.messages, data.total, offset);
          slot.total = data.total;
          slot.fetchedAt = Date.now();
          adoptTokenUsage(slot, data);
          rebuild(slot);
        } else {
          await refreshLatestSlotFromServer(sessionId, slot, requestOptions.limit === undefined ? SESSION_MESSAGES_PAGE_SIZE : requestOptions.limit, canRequest);
        }
        slot.status = 'idle';
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
   * Load older (paginated) messages: the rows before the window.
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
      const canRequest = opts.canRequest ?? (() => true);
      if (!slot.hasMore || !canRequest()) return { slot, prependedCount };

      try {
        const offset = slot.offset;
        const data = await requestSessionHistoryPage(sessionId, {
          limit: opts.limit ?? SESSION_MESSAGES_PAGE_SIZE,
          offset,
        });
        const before = slot.window.rows.length;
        slot.window = placeOlder(slot.window, data.messages, data.total, offset);
        slot.total = data.total;
        prependedCount = slot.window.rows.length - before;
        const usage = adoptTokenUsage(slot, data);
        rebuild(slot);
        if (prependedCount > 0 || usage) notify(sessionId);
        return { slot, prependedCount };
      } catch (error) {
        console.error(`[SessionStore] fetchMore failed for ${sessionId}:`, error);
        return { slot, prependedCount };
      }
    });
  }, [getSlot, notify]);

  /**
   * Refreshes the newest rows (see refreshLatestSlotFromServer).
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
   * An already-sent message was edited: the transcript was rewritten, so the window starts over from its newest rows.
   */
  const truncateAt = useCallback((sessionId: string, _anchorId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return;
    slot.window = EMPTY_WINDOW;
    rebuild(slot);
    notify(sessionId);
    void refreshLatestFromServer(sessionId);
  }, [notify, refreshLatestFromServer]);

  // A live event means the transcript moved: read it, at most every LIVE_READ_MS per chat.
  const liveReadsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const scheduleLiveRead = useCallback((sessionId: string) => {
    if (liveReadsRef.current.has(sessionId)) return;
    liveReadsRef.current.set(sessionId, setTimeout(() => {
      liveReadsRef.current.delete(sessionId);
      void refreshLatestFromServer(sessionId);
    }, LIVE_READ_MS));
  }, [refreshLatestFromServer]);

  /**
   * A typed message or a notice (`local_` id), an error, or a live event. Typed messages and notices are drawn
   * until the transcript has them; a live event makes the page read the transcript.
   */
  const appendRealtime = useCallback((sessionId: string, msg: NormalizedMessage) => {
    const slot = getSlot(sessionId);
    const note = msg.id.startsWith('local_') || msg.id.startsWith('protocol_error_') || msg.kind === 'error' || msg.kind === 'status';
    if (!note) {
      scheduleLiveRead(sessionId);
      return;
    }
    const typed = msg.role === 'user' && msg.kind === 'text';
    const message: NormalizedMessage = typed ? { ...msg, delivery: 'pending' } : msg;
    slot.notes = [...slot.notes, { message, at: windowEnd(slot.window) }];
    rebuild(slot);
    notify(sessionId);
    if (!typed) return;
    setTimeout(() => {
      const i = slot.notes.findIndex((n) => n.message.id === msg.id);
      if (i < 0) return;
      slot.notes = slot.notes.map((n, j) => (j === i ? { ...n, message: { ...n.message, delivery: 'failed' } } : n));
      rebuild(slot);
      notify(sessionId);
    }, UNDELIVERED_AFTER_MS + 1000);
  }, [getSlot, notify, scheduleLiveRead]);

  /**
   * Check if a session's data is stale (>30s old).
   */
  const isStale = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return true;
    return Date.now() - slot.fetchedAt > STALE_THRESHOLD_MS;
  }, []);

  /**
   * The streamed reply so far: one row at the end that grows.
   */
  const updateStreaming = useCallback((sessionId: string, accumulatedText: string, msgProvider: LLMProvider) => {
    const slot = getSlot(sessionId);
    if (slot.stream?.content === accumulatedText) return;
    slot.stream = {
      id: `__stream_${sessionId}`, sessionId, timestamp: slot.stream?.timestamp ?? new Date().toISOString(),
      provider: msgProvider, kind: 'stream_delta', content: accumulatedText,
    };
    slot.streamEnded = false;
    rebuild(slot);
    notify(sessionId);
  }, [getSlot, notify]);

  /**
   * The streamed reply is complete: it stays until the next read brings the transcript's copy.
   */
  const finalizeStreaming = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot?.stream) return;
    slot.streamEnded = true;
    scheduleLiveRead(sessionId);
  }, [scheduleLiveRead]);

  /**
   * What the page draws for a session, in order.
   */
  const getMessages = useCallback((sessionId: string): NormalizedMessage[] => {
    return storeRef.current.get(sessionId)?.view ?? EMPTY;
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
