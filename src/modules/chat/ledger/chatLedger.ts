import type { NormalizedMessage } from '@/shared/types';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { foldRuns, isReply, replyState, rowIdOf, segmentTurns, starterOf, type StarterKind } from '@/modules/chat/utils/repeatedReplies';

/**
 * quests: the chat view as a ledger (requirement 52). One append-only list of drawn rows per chat, the only
 * thing the page draws. Pure functions over a plain object, so the store and the tests drive the same code.
 *
 * The rules, each named by the invariant in the plan:
 *  I1  Grow only: nothing here removes a row.
 *  I2  Order is permanent: older history goes before the first row as a block, everything else after the last.
 *  I3  One row per id: `alias` maps every id ever seen (the row's, a local echo's, a transcript copy's) to its row.
 *  I4  A confirmation changes content only; a copy that would change the row's kind is refused.
 *  I5  Drawn state is fixed at append: `foldId` only here, at append; `open` only through `setOpen`.
 *  I6  Unseen rows of one read keep the transcript's order.
 *  I7  A typed message's copy confirms it by id, else by text (the oldest pending echo with the same words).
 *  I8  A typed message not confirmed within a minute is "not delivered", and stays drawn; a later copy still confirms it.
 *  I9  A streamed reply is one row that grows, closed by `endStream`; the transcript's copy confirms it by text.
 *  I10 A background row arriving while a reply streams waits in `queued` and lands when the stream ends.
 *  I11 An edit marks the replaced rows superseded; nothing is removed; a read started before the cut is dropped.
 *  I12 A repeated reply folds at append (only the new reply; the rows before it were drawn and stay).
 *  I13 A batch (a fresh page, an older page) folds by requirement 39's rule, rows already drawn never fold.
 *  I14 Rows the page does not draw (tool results, task events) live here too, for pairing.
 */

export type RowSource = 'transcript' | 'live' | 'local' | 'stream';

export type LedgerRow = NormalizedMessage & {
  /** Body rows count up from 1; a block of older history counts down from 0. The array order is the truth. */
  pos: number;
  /** How the row first reached the page; never changes. */
  source: RowSource;
  /** The fold the row was appended into, set once at append (I5). */
  foldId?: string;
  /** A typed message not yet in the transcript, or one that never got there (I8). */
  delivery?: 'pending' | 'failed';
  /** Replaced by an edit (I11): still drawn, dimmed. */
  superseded?: boolean;
  /** When the row was appended, for the text confirmation window and the "not delivered" clock. */
  enteredAt?: number;
  /** A note of the ledger's own: a gap in what the page saw. */
  noteKind?: 'gap';
};

export type Ledger = {
  v: 1;
  sessionId: string;
  /** Render order. Replaced by a new array on every change, never sorted. */
  rows: LedgerRow[];
  /** Every id ever seen -> the id of its row. */
  alias: Record<string, string>;
  /** Click state by key (see rowOpen.ts), kept with the ledger so it is persisted with it. */
  open: Record<string, true>;
  minPos: number;
  maxPos: number;
  /** Bumped by `cut`; a read that started under an older epoch is dropped. */
  epoch: number;
  /** The fold-on-append state (I12). */
  fold: { lastReplyState: string | null; starter: StarterKind; runFoldId: string | null };
  /** `total` of the last latest read, for the bridge after a long absence. */
  transcriptTotal: number;
  /** Background rows held while a reply streams (I10). */
  queued: Array<{ message: NormalizedMessage; at: number }>;
};

export type ReadOptions = {
  direction: 'latest' | 'older';
  /** The ledger's epoch when the read was requested. */
  epoch: number;
  /** A page that lands as a block (a fresh page, an older page): folded by requirement 39's rule. */
  batch: boolean;
  /** Append the page even without a row in common (after a gap note). */
  bridge?: boolean;
  total?: number;
  now: number;
};

export type ReadResult = { changed: boolean; overlapped: boolean; appended: number; prepended: number; stale: boolean };

/** A typed message is "not delivered" when the transcript has not confirmed it after this long. */
export const UNDELIVERED_AFTER_MS = 60_000;
/** A background row waits for a streaming reply at most this long (I10). */
const QUEUE_AT_MOST_MS = 30_000;
/** A transcript copy confirms a typed message or a streamed reply when stamped no earlier than this before it. */
const CONFIRM_CLOCK_SKEW_MS = 60_000;

export function createLedger(sessionId: string): Ledger {
  return {
    v: 1,
    sessionId,
    rows: [],
    alias: {},
    open: {},
    minPos: 0,
    maxPos: 0,
    epoch: 0,
    fold: { lastReplyState: null, starter: 'none', runFoldId: null },
    transcriptTotal: 0,
    queued: [],
  };
}

const normalizeText = (text: unknown): string => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '');
const timeOf = (m: NormalizedMessage): number => {
  const t = Date.parse(m.timestamp);
  return Number.isFinite(t) ? t : 0;
};
const countOf = (list: unknown): number => (Array.isArray(list) ? list.length : 0);
const isUserText = (m: NormalizedMessage): boolean => m.kind === 'text' && m.role === 'user';
const isAssistantText = (m: NormalizedMessage): boolean => m.kind === 'text' && m.role === 'assistant';

/** The index of the row an id names, through the alias table; -1 when the page never saw it. */
function indexOf(l: Ledger, id: string, index: Map<string, number>): number {
  const rowId = l.alias[id];
  return rowId === undefined ? -1 : index.get(rowId) ?? -1;
}

function indexRows(l: Ledger): Map<string, number> {
  const index = new Map<string, number>();
  l.rows.forEach((row, i) => index.set(row.id, i));
  return index;
}

export function resolve(l: Ledger, id: string): LedgerRow | undefined {
  const rowId = l.alias[id];
  return rowId === undefined ? undefined : l.rows.find((row) => row.id === rowId);
}

/** The content of a row, without the ledger's own marks: what a transcript copy is compared against. */
function contentOf(row: LedgerRow): Record<string, unknown> {
  const { pos: _pos, source: _source, foldId: _foldId, delivery: _delivery, superseded: _superseded, enteredAt: _enteredAt, noteKind: _noteKind, ...content } = row;
  return content;
}

function sameContent(row: LedgerRow, incoming: NormalizedMessage): boolean {
  try {
    return JSON.stringify({ ...contentOf(row), id: incoming.id }) === JSON.stringify(incoming);
  } catch {
    return false;
  }
}

/**
 * I4: the row keeps its id, its place and its drawn state; everything else is the copy's. A copy of another kind
 * (a tool call for a text row) is refused, except the one transition a streamed reply makes into its text.
 */
function confirmRow(l: Ledger, i: number, incoming: NormalizedMessage): boolean {
  const old = l.rows[i];
  l.alias[incoming.id] = old.id;
  const kindChanges = old.kind !== incoming.kind || (old.role ?? null) !== (incoming.role ?? null);
  const streamToText = old.kind === 'stream_delta' && isAssistantText(incoming);
  if (kindChanges && !streamToText) {
    if (!old.delivery) console.warn(`[ledger] ${l.sessionId}: a copy of ${old.id} would change its kind (${old.kind} -> ${incoming.kind}); kept as drawn`);
    if (old.delivery) {
      // A typed echo confirmed by a row of another kind (an attachment-only turn the server records
      // differently): the echo is delivered, whatever the copy's shape.
      l.rows = l.rows.slice();
      l.rows[i] = { ...old, delivery: undefined };
      return true;
    }
    return false;
  }
  if (!old.delivery && sameContent(old, incoming)) return false;
  const { delivery: _delivery, ...kept } = old;
  l.rows = l.rows.slice();
  l.rows[i] = {
    ...incoming,
    id: old.id,
    sessionId: l.sessionId,
    pos: old.pos,
    source: old.source,
    ...(old.foldId ? { foldId: old.foldId } : {}),
    ...(old.superseded ? { superseded: true } : {}),
    ...(old.enteredAt ? { enteredAt: old.enteredAt } : {}),
    ...(kept.noteKind ? { noteKind: kept.noteKind } : {}),
  };
  return true;
}

/**
 * I7, I9 and the pairing of tool rows: the row an unknown-id copy stands for, or -1.
 *  - a typed echo: the oldest pending or failed user row with the same words and attachment counts, stamped no
 *    earlier than a minute before the echo was typed (a message queued behind a long tool call is written to the
 *    transcript minutes after Enter, so there is no upper bound);
 *  - a streamed or live reply: an assistant text row with the same words within the same window;
 *  - a tool call or result: the row with the same tool id.
 */
function matchByText(l: Ledger, m: NormalizedMessage): number {
  if ((m.kind === 'tool_use' || m.kind === 'tool_result') && m.toolId) {
    for (let i = l.rows.length - 1; i >= 0; i -= 1) {
      const row = l.rows[i];
      if (row.kind === m.kind && row.toolId === m.toolId && !l.alias[m.id]) return i;
    }
    return -1;
  }
  if (!(isUserText(m) || isAssistantText(m))) return -1;
  const text = normalizeText(m.content);
  const stamp = timeOf(m);
  if (isUserText(m)) {
    for (let i = 0; i < l.rows.length; i += 1) {
      const row = l.rows[i];
      if (!row.delivery || !isUserText(row)) continue;
      if (normalizeText(row.content) !== text) continue;
      if (countOf(row.images) !== countOf(m.images) || countOf(row.files) !== countOf(m.files)) continue;
      if (stamp && row.enteredAt && stamp < row.enteredAt - CONFIRM_CLOCK_SKEW_MS) continue;
      return i;
    }
    return -1;
  }
  if (!text) return -1;
  for (let i = l.rows.length - 1; i >= 0; i -= 1) {
    const row = l.rows[i];
    if (row.source !== 'stream' && row.source !== 'live') continue;
    if (!isAssistantText(row) || normalizeText(row.content) !== text) continue;
    if (stamp && row.enteredAt && stamp < row.enteredAt - CONFIRM_CLOCK_SKEW_MS) continue;
    // Already confirmed by another copy: its alias points at a transcript id.
    if (Object.keys(l.alias).some((id) => id !== row.id && l.alias[id] === row.id && !id.startsWith('local_'))) continue;
    return i;
  }
  return -1;
}

/** I12: the fold decision for one row at append, from what it is when drawn. */
function foldOnAppend(l: Ledger, row: LedgerRow): LedgerRow {
  let out = row;
  for (const m of normalizedToChatMessages([row])) {
    const starter = starterOf(m);
    if (starter !== 'none') {
      l.fold.starter = starter;
      // A typed or an agent's turn closes the run: the next report's reply starts a new one, and shows.
      if (starter !== 'hook' && starter !== 'report') { l.fold.runFoldId = null; l.fold.lastReplyState = null; }
      continue;
    }
    if (!isReply(m)) continue;
    // Only a report turn's reply is part of a run; any other reply is outside every run.
    if (l.fold.starter !== 'report') { l.fold.runFoldId = null; l.fold.lastReplyState = null; continue; }
    const state = replyState(String(m.content ?? ''));
    if (l.fold.lastReplyState !== null && state === l.fold.lastReplyState) {
      l.fold.runFoldId ??= row.id;
      out = { ...out, foldId: l.fold.runFoldId };
    } else {
      l.fold.runFoldId = null;
    }
    l.fold.lastReplyState = state;
  }
  return out;
}

/** The record id of a projected row (`<id>` or `<id>_<n>`), for the fold map. */
function recordIdOf(projectedId: string, known: Set<string>): string | null {
  if (known.has(projectedId)) return projectedId;
  const stripped = projectedId.replace(/_\d+$/, '');
  return known.has(stripped) ? stripped : null;
}

/**
 * I13: a batch folds by requirement 39's rule over everything the page holds plus the batch, with every row
 * already in the ledger as "seen" (drawn, so it never folds). Only batch rows get a fold id.
 */
function foldBatch(l: Ledger, batch: LedgerRow[], before: LedgerRow[], after: LedgerRow[]): LedgerRow[] {
  const all = [...before, ...batch, ...after];
  const messages = normalizedToChatMessages(all);
  const seen = new Set<string>();
  const drawn = new Set([...before, ...after].map((row) => row.id));
  for (const m of messages) {
    const record = m.id ? recordIdOf(m.id, drawn) : null;
    if (record) seen.add(rowIdOf(m));
  }
  const turns = segmentTurns(messages);
  const folds = foldRuns(messages, turns, seen);
  const batchIds = new Set(batch.map((row) => row.id));
  const foldIdByRecord = new Map<string, string>();
  for (const [m, fold] of folds) {
    const record = m.id ? recordIdOf(m.id, batchIds) : null;
    if (record && !foldIdByRecord.has(record)) foldIdByRecord.set(record, fold.id);
  }
  // The fold-on-append state continues from the batch's last turn.
  const last = turns[turns.length - 1];
  if (last) {
    l.fold.starter = last.starter;
    const reply = last.reply >= 0 ? messages[last.reply] : null;
    l.fold.lastReplyState = reply ? replyState(String(reply.content ?? '')) : l.fold.lastReplyState;
    l.fold.runFoldId = reply ? (folds.get(reply)?.id ?? null) : null;
  }
  return batch.map((row) => {
    const foldId = foldIdByRecord.get(row.id);
    return foldId ? { ...row, foldId } : row;
  });
}

function toRow(l: Ledger, m: NormalizedMessage, source: RowSource, pos: number, now: number): LedgerRow {
  return { ...m, sessionId: l.sessionId, pos, source, enteredAt: now };
}

/** The ledger's own note: the page did not see what came between. */
function gapNote(l: Ledger, now: number): NormalizedMessage {
  return {
    id: `gap_${now}`,
    sessionId: l.sessionId,
    timestamp: new Date(now).toISOString(),
    provider: 'claude',
    kind: 'text',
    role: 'assistant',
    content: 'Rows the page did not see while it was away come next; the ones in between are not shown.',
  } as NormalizedMessage;
}

/** Appends rows at the end, in order, each folded at append or the batch folded as one (I2, I12, I13). */
function appendRows(l: Ledger, messages: NormalizedMessage[], source: RowSource, now: number, batch: boolean): number {
  if (messages.length === 0) return 0;
  const rows = messages.map((m) => toRow(l, m, source, (l.maxPos += 1), now));
  for (const row of rows) l.alias[row.id] = row.id;
  const folded = batch ? foldBatch(l, rows, l.rows, []) : rows.map((row) => foldOnAppend(l, row));
  l.rows = [...l.rows, ...folded];
  return folded.length;
}

/** Prepends a block of older history before the first row (I2); the block folds as a batch. */
function prependRows(l: Ledger, messages: NormalizedMessage[], now: number): number {
  if (messages.length === 0) return 0;
  const rows = messages.map((m, i) => toRow(l, m, 'transcript', l.minPos - messages.length + i, now));
  l.minPos -= messages.length;
  for (const row of rows) l.alias[row.id] = row.id;
  const fold = { ...l.fold };
  const folded = foldBatch(l, rows, [], l.rows);
  l.fold = fold; // the end of the chat is unchanged by older history
  l.rows = [...folded, ...l.rows];
  return folded.length;
}

/** Flushes background rows that waited for a stream (I10): at its end, or after 30 s whatever happens. */
function flushQueued(l: Ledger, now: number, all: boolean): boolean {
  if (l.queued.length === 0) return false;
  const due = all ? l.queued : l.queued.filter((q) => now - q.at >= QUEUE_AT_MOST_MS);
  if (due.length === 0) return false;
  l.queued = l.queued.filter((q) => !due.includes(q));
  appendRows(l, due.map((q) => q.message), 'live', now, false);
  return true;
}

const hasOpenStream = (l: Ledger): boolean => l.rows.some((row) => row.kind === 'stream_delta');

/** A row that starts a background turn: a task's report, a hand-back, a hook's feedback. */
function isBackgroundStarter(m: NormalizedMessage): boolean {
  if (m.kind === 'task_notification') return true;
  if (!isUserText(m)) return false;
  const head = (m.content ?? '').trimStart();
  return head.startsWith('<task-notification>') || head.startsWith('<system-reminder>') || head.startsWith('Stop hook feedback')
    || head.startsWith('Another Claude session sent a message') || head.startsWith('<agent-message') || head.startsWith('<cross-session-message');
}

/**
 * A page of the transcript. Known rows are confirmed in place; unseen rows land in transcript order: as a block
 * before the first row when the page is older history that touches it, at the end otherwise (a late row is
 * late: Noam, 3 Nov, "at the end, never reorder"). A latest page with no row in common and a non-empty ledger
 * changes nothing: the caller bridges (a bigger read, then a gap note with `bridge`).
 */
export function appendRead(l: Ledger, page: NormalizedMessage[], options: ReadOptions): ReadResult {
  const none: ReadResult = { changed: false, overlapped: false, appended: 0, prepended: 0, stale: false };
  if (options.epoch !== l.epoch) return { ...none, stale: true };
  if (typeof options.total === 'number' && options.direction === 'latest') l.transcriptTotal = options.total;
  let changed = flushQueued(l, options.now, false);
  const index = indexRows(l);
  const unseen: Array<{ m: NormalizedMessage; at: number }> = [];
  let firstKnown = -1;
  page.forEach((m, at) => {
    let i = indexOf(l, m.id, index);
    if (i < 0) i = matchByText(l, m);
    if (i >= 0) {
      if (confirmRow(l, i, m)) changed = true;
      if (firstKnown < 0) firstKnown = at;
      return;
    }
    unseen.push({ m, at });
  });
  let appended = 0;
  let prepended = 0;
  if (l.rows.length === 0) {
    appended = appendRows(l, unseen.map((u) => u.m), 'transcript', options.now, true);
  } else if (firstKnown < 0) {
    if (options.direction === 'older') {
      prepended = prependRows(l, unseen.map((u) => u.m), options.now);
    } else if (options.bridge) {
      appended = appendRows(l, [gapNote(l, options.now), ...unseen.map((u) => u.m)], 'transcript', options.now, true);
      const gap = l.rows[l.rows.length - appended];
      if (gap) {
        l.rows = l.rows.slice();
        l.rows[l.rows.length - appended] = { ...gap, noteKind: 'gap' };
      }
    } else {
      return { ...none, changed };
    }
  } else {
    const firstRowId = l.alias[page[firstKnown].id];
    const before = unseen.filter((u) => u.at < firstKnown).map((u) => u.m);
    const after = unseen.filter((u) => u.at > firstKnown).map((u) => u.m);
    if (before.length > 0 && firstRowId === l.rows[0].id) prepended = prependRows(l, before, options.now);
    else appended += appendRows(l, before, 'transcript', options.now, options.batch);
    appended += appendRows(l, after, 'transcript', options.now, options.batch);
  }
  return { changed: changed || appended > 0 || prepended > 0, overlapped: true, appended, prepended, stale: false };
}

/** A live event's row (I3 through a replay, I10 while a reply streams). */
export function appendLive(l: Ledger, m: NormalizedMessage, now: number): boolean {
  let changed = flushQueued(l, now, false);
  const index = indexRows(l);
  let i = indexOf(l, m.id, index);
  if (i < 0) i = matchByText(l, m);
  if (i >= 0) return confirmRow(l, i, m) || changed;
  if (hasOpenStream(l) && isBackgroundStarter(m)) {
    l.queued = [...l.queued, { message: m, at: now }];
    return changed;
  }
  appendRows(l, [m], 'live', now, false);
  return true;
}

/** A typed message's echo, or a notice the composer draws (I7, I8). */
export function appendLocal(l: Ledger, m: NormalizedMessage, now: number): boolean {
  if (l.alias[m.id] !== undefined) return false;
  const row = toRow(l, m, 'local', (l.maxPos += 1), now);
  const pending = isUserText(m) ? { ...row, delivery: 'pending' as const } : row;
  l.alias[row.id] = row.id;
  l.rows = [...l.rows, foldOnAppend(l, pending)];
  return true;
}

/** The streamed reply so far: one row that grows in place (I9). */
export function appendStreamDelta(l: Ledger, text: string, provider: NormalizedMessage['provider'], now: number): boolean {
  const i = l.rows.findIndex((row) => row.kind === 'stream_delta');
  if (i >= 0) {
    if (l.rows[i].content === text) return false;
    l.rows = l.rows.slice();
    l.rows[i] = { ...l.rows[i], content: text };
    return true;
  }
  const m: NormalizedMessage = { id: `__stream_${l.sessionId}_${now}`, sessionId: l.sessionId, timestamp: new Date(now).toISOString(), provider, kind: 'stream_delta', content: text };
  const row = toRow(l, m, 'stream', (l.maxPos += 1), now);
  l.alias[row.id] = row.id;
  l.rows = [...l.rows, row];
  return true;
}

/** The streamed reply is complete: it becomes a text row, and what waited for it lands (I9, I10). */
export function endStream(l: Ledger, now: number): boolean {
  const i = l.rows.findIndex((row) => row.kind === 'stream_delta');
  let changed = false;
  if (i >= 0) {
    l.rows = l.rows.slice();
    const row = { ...l.rows[i], kind: 'text' as const, role: 'assistant' as const };
    l.rows[i] = foldOnAppend(l, row);
    changed = true;
  }
  return flushQueued(l, now, true) || changed;
}

/** I8: pending echoes older than a minute are "not delivered". */
export function markUndelivered(l: Ledger, now: number): boolean {
  let changed = false;
  l.rows.forEach((row, i) => {
    if (row.delivery === 'pending' && row.enteredAt && now - row.enteredAt >= UNDELIVERED_AFTER_MS) {
      if (!changed) l.rows = l.rows.slice();
      l.rows[i] = { ...row, delivery: 'failed' };
      changed = true;
    }
  });
  return changed;
}

/**
 * I11: an edit of an earlier message. The anchored row and everything after it are replaced, up to the echo of
 * the replacement itself (the newest row tagged with the anchor), which stays as it is. Nothing is removed.
 */
export function cut(l: Ledger, anchorId: string): boolean {
  const from = l.rows.findIndex((row) => row.transcriptAnchorId === anchorId);
  if (from < 0) return false;
  let to = l.rows.length;
  for (let i = l.rows.length - 1; i > from; i -= 1) {
    if (l.rows[i].replacesAnchorId === anchorId) { to = i; break; }
  }
  l.rows = l.rows.map((row, i) => (i >= from && i < to && !row.superseded ? { ...row, superseded: true } : row));
  l.epoch += 1;
  l.fold = { lastReplyState: null, starter: 'none', runFoldId: null };
  return true;
}

/** I5: the only writer of a row's open state, from a click. */
export function setOpen(l: Ledger, key: string, open: boolean): boolean {
  if (Boolean(l.open[key]) === open) return false;
  if (open) l.open = { ...l.open, [key]: true };
  else { const { [key]: _gone, ...rest } = l.open; l.open = rest; }
  return true;
}

/**
 * Two windows on one chat (persistence): the stored ledger's order stands, the other's unseen rows follow in
 * its order, and the open states are joined.
 */
export function mergeLedgers(stored: Ledger, mine: Ledger): Ledger {
  const known = new Set(stored.rows.map((row) => row.id));
  const extra = mine.rows.filter((row) => !known.has(row.id));
  return {
    ...stored,
    rows: extra.length > 0 ? [...stored.rows, ...extra] : stored.rows,
    alias: { ...stored.alias, ...mine.alias },
    open: { ...stored.open, ...mine.open },
    maxPos: Math.max(stored.maxPos, mine.maxPos),
    minPos: Math.min(stored.minPos, mine.minPos),
    fold: mine.fold,
    queued: [],
  };
}
