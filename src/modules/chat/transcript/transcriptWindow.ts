import type { NormalizedMessage } from '@/shared/types';
import { normalizedToChatMessages } from '@/modules/chat/hooks/useChatMessages';
import { foldRepeatedReplies, rowIdOf } from '@/modules/chat/utils/repeatedReplies';

/**
 * quests: the chat view draws the transcript (requirement 52, Noam, 9 Nov: "there is a ssot. just display it").
 * The page holds a window of the server's rows, at transcript positions [start, start + rows.length). A read is
 * placed by position: the transcript only grows, so the newest `n` rows of a transcript of `total` rows sit at
 * [total - n, total). Nothing here compares rows by id or by words.
 */

export type TranscriptWindow = {
  /** The transcript position of rows[0]. */
  start: number;
  rows: NormalizedMessage[];
};

export const EMPTY_WINDOW: TranscriptWindow = { start: 0, rows: [] };

export const windowEnd = (w: TranscriptWindow): number => w.start + w.rows.length;

/**
 * The newest `page.length` rows of a transcript of `total` rows, placed over the window. Null when the page does
 * not reach the window (the page was away longer than one read): the caller reads more, or starts over from it.
 * A transcript that shrank (an edit, a rewind) starts over from the page.
 */
export function placeLatest(w: TranscriptWindow, page: NormalizedMessage[], total: number): TranscriptWindow | null {
  const from = total - page.length;
  if (w.rows.length === 0 || total < windowEnd(w) || from <= w.start) return { start: from, rows: page };
  if (from > windowEnd(w)) return null;
  return { start: w.start, rows: [...w.rows.slice(0, from - w.start), ...page] };
}

/**
 * An older page: the rows read at tail offset `offset` of a transcript of `total` rows, which sit at
 * [total - offset - page.length, total - offset). Only the part before the window is added.
 */
export function placeOlder(w: TranscriptWindow, page: NormalizedMessage[], total: number, offset: number): TranscriptWindow {
  const from = total - offset - page.length;
  const before = page.slice(0, Math.max(0, Math.min(page.length, w.start - from)));
  if (before.length === 0) return w;
  return { start: w.start - before.length, rows: [...before, ...w.rows] };
}

/** A row the page draws beside the transcript until the transcript has it: a typed message, or a notice. */
export type Note = {
  message: NormalizedMessage;
  /** The window end when it was made: it is drawn after the transcript rows before this position. */
  at: number;
};

const isTypedUserRow = (m: NormalizedMessage): boolean =>
  m.kind === 'text' && m.role === 'user' && !String(m.content ?? '').trimStart().startsWith('<');

/**
 * The typed messages the transcript has taken over: a typed message goes when the transcript has a typed user row
 * at or after the position it was sent at. Notices (errors, the composer's own lines) stay for the page's life.
 */
export function settleNotes(w: TranscriptWindow, notes: Note[]): Note[] {
  const typedSince = (at: number) => w.rows.filter((m, i) => w.start + i >= at && isTypedUserRow(m)).length;
  let taken = 0;
  return notes.filter((note) => {
    if (note.message.role !== 'user' || note.message.kind !== 'text' || typedSince(note.at) <= taken) return true;
    taken += 1;
    return false;
  });
}

/** Requirement 39 and 114: of equal replies in turns Noam did not start, the last shows and the earlier ones fold. */
function foldIds(rows: NormalizedMessage[]): Map<string, string> {
  const messages = normalizedToChatMessages(rows);
  const ids = new Set(rows.map((m) => m.id));
  // A drawn message's id is its row's id, or the row's id plus "_<n>" when one row draws as several.
  const recordOf = (m: (typeof messages)[number]) => { const id = rowIdOf(m); return ids.has(id) ? id : id.replace(/_\d+$/, ''); };
  const byRecord = new Map<string, string>();
  for (const [m, fold] of foldRepeatedReplies(messages)) byRecord.set(recordOf(m), fold.id);
  return byRecord;
}

/** What the page draws: the transcript rows with their folds, the notes at their places, then the streamed reply. */
export function view(w: TranscriptWindow, notes: Note[], stream: NormalizedMessage | null): NormalizedMessage[] {
  const folds = foldIds(w.rows);
  const rows = w.rows.map((m) => {
    const foldId = folds.get(m.id);
    return foldId ? { ...m, foldId } : m;
  });
  const out: NormalizedMessage[] = [];
  let n = 0;
  rows.forEach((m, i) => {
    while (n < notes.length && notes[n].at <= w.start + i) out.push(notes[n++].message);
    out.push(m);
  });
  while (n < notes.length) out.push(notes[n++].message);
  if (stream) out.push(stream);
  return out;
}
