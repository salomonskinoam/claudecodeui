import type { ChatMessage } from '@/shared/types';

/**
 * quests: replies that repeat are folded (requirement 39). The specification, word for word the requirement, so the
 * code can be rebuilt from it:
 *
 * Folding, specified so it can be rebuilt from the text alone. A ROW is one entry of the transcript as the page holds it: id, type (user or assistant), flags isToolUse, isThinking, isTaskNotification (a task's report), agentReportFrom (text handed in; "the stop hook" or an agent's id), noteKind (a note: "interrupt" for an interrupted turn, "tools" for a tools-loaded notice, "gap" for a gap in what the page saw), content (text), timestamp.
 * Step 1, turns. A row is a STARTER when it is a report, or handed in, or an "interrupt" note, or a user row that is not a tool result. Its kind: "report" for a report row, or a user row whose text starts with "<task-notification>" or "<system-reminder>"; "hook" for a handed-in row from "the stop hook", or a user row whose text starts with "Stop hook feedback"; "agent" for any other handed-in row; "typed" for an "interrupt" note or any other user row. A "tools" or "gap" note starts nothing. A TURN is a starter row and every row after it up to the next starter, excluded. Rows before the first starter form a turn of kind "none". The turn's REPLY is its last row that is assistant text: type assistant, not a tool call, not thinking, not a report, not handed in, not a note, non-empty text. A turn may have no reply.
 * Step 2, the state of a reply. Split the text into lines, remove "**", collapse whitespace, drop empty lines. REQUIRED = the last line starting with "Required from you:" (case ignored). If there is none, the state is the whole text with whitespace collapsed. Else LAST = the final line, KIND = its opening words if they are one of "waiting for", "question", "blocker", "done" (case ignored), else empty; the state is lowercase(REQUIRED) + " | " + ("waiting for" when KIND is "waiting for", else lowercase(LAST)).
 * Step 3, the folds. Walk the turns in order with a RUN (a list of turns) and its state. A "hook" turn is skipped: it neither joins nor closes the run. A "report" turn with a reply: S = the reply's state; if the run is not empty and S differs from the run's state, close the run; then add the turn and set the run's state to S. Any other turn (typed, agent, none, or a report without a reply) closes the run. At the end, close the run. CLOSE: LAST = the run's last turn; HIDDEN = the run's turns except LAST and except those whose reply id is in SEEN. If HIDDEN is not empty: one fold, id = the first hidden reply's id, count = the number of hidden turns, from and to = the first and last hidden replies' timestamps; every row of every hidden turn, from its starter row to its last row, is hidden, and the first row of the first hidden turn draws the fold line "count replies with the same state folded, from to to · show". Then empty the run. SEEN = the ids of assistant non-tool rows this page has drawn unfolded; a fold opened by click stays open for the page's life. The folds are computed over the whole transcript held by the page, never over the visible window alone.
 */

export type StarterKind = 'typed' | 'report' | 'hook' | 'agent' | 'none';

export type Turn = {
  /** Index of the first row of the turn (the starter row, or 0 for rows before any starter). */
  start: number;
  /** Index after the turn's last row. */
  end: number;
  starter: StarterKind;
  /** Index of the reply, the turn's last text; -1 when the turn has none. */
  reply: number;
};

export type ReplyFold = {
  /** The run's id: the id of its first folded reply. */
  id: string;
  /** How many replies are folded. */
  count: number;
  /** The folded replies' time range, as ISO timestamps. */
  from: string;
  to: string;
  /** True on the run's first hidden message: the one that renders the fold line. */
  first: boolean;
};

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Step 1a: what kind of row starts a turn, or 'none' for a row that starts nothing. */
export function starterOf(m: ChatMessage): StarterKind {
  if (m.noteKind) return m.noteKind === 'interrupt' ? 'typed' : 'none';
  if (m.isTaskNotification) return 'report';
  if (m.agentReportFrom) return m.agentReportFrom === 'the stop hook' ? 'hook' : 'agent';
  if (m.type !== 'user' || m.isToolUse || typeof m.content !== 'string') return 'none';
  const head = m.content.trimStart();
  if (head.startsWith('Stop hook feedback')) return 'hook';
  if (head.startsWith('<task-notification>') || head.startsWith('<system-reminder>')) return 'report';
  return 'typed';
}

/** Step 1b: a reply row: the chat's own text, not a tool call, not a note, not something handed in. */
export const isReply = (m: ChatMessage): boolean =>
  m.type === 'assistant' && !m.isToolUse && !m.isThinking && !m.isTaskNotification && !m.agentReportFrom && !m.noteKind
  && typeof m.content === 'string' && m.content.trim() !== '';

/** Step 1: the transcript as turns. */
export function segmentTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn = { start: 0, end: 0, starter: 'none', reply: -1 };
  messages.forEach((m, i) => {
    const starter = starterOf(m);
    if (starter !== 'none') {
      current.end = i;
      if (current.end > current.start) turns.push(current);
      current = { start: i, end: i, starter, reply: -1 };
      return;
    }
    if (isReply(m)) current.reply = i;
  });
  current.end = messages.length;
  if (current.end > current.start) turns.push(current);
  return turns;
}

/** Step 2: the state of a reply: its "Required from you:" line and the kind of its closing line, else its whole text. */
export function replyState(text: string): string {
  const lines = text.split('\n').map((l) => normalize(l.replace(/\*\*/g, ''))).filter(Boolean);
  const required = [...lines].reverse().find((l) => /^Required from you:/i.test(l));
  if (!required) return normalize(text);
  const last = lines[lines.length - 1] ?? '';
  const kind = /^(waiting for|question|blocker|done)\b/i.exec(last)?.[1].toLowerCase() ?? '';
  return `${required.toLowerCase()} | ${kind === 'waiting for' ? kind : last.toLowerCase()}`;
}

/** A row's id, for `seen` and the fold id; a row without one (a test fixture) is known by its timestamp. */
export const rowIdOf = (m: ChatMessage): string => m.id ?? String(m.timestamp ?? '');

/**
 * Step 3: the folds. `seen` holds the ids of replies Noam has already had on screen on this page: a turn with
 * such a reply never folds later.
 */
export function foldRuns(messages: ChatMessage[], turns: Turn[], seen: ReadonlySet<string> = new Set()): Map<ChatMessage, ReplyFold> {
  const folds = new Map<ChatMessage, ReplyFold>();
  const stamp = (turn: Turn) => rowIdOf(messages[turn.reply]);
  const at = (turn: Turn) => String(messages[turn.reply].timestamp ?? '');
  // The runs: consecutive report-started turns with a reply and one state. Any other turn ends the run.
  let run: Turn[] = [];
  let state: string | null = null;
  const close = () => {
    const last = run[run.length - 1];
    const hidden = run.filter((t) => t !== last && !seen.has(stamp(t)));
    if (hidden.length > 0) {
      const fold: Omit<ReplyFold, 'first'> = {
        id: stamp(hidden[0]),
        count: hidden.length,
        from: at(hidden[0]),
        to: at(hidden[hidden.length - 1]),
      };
      let first = true;
      for (const t of hidden) {
        for (let i = t.start; i < t.end; i += 1) {
          folds.set(messages[i], { ...fold, first });
          first = false;
        }
      }
    }
    run = [];
    state = null;
  };
  for (const turn of turns) {
    if (turn.starter === 'hook') continue; // no reply of its own; neither joins nor ends a run
    const foldableTurn = turn.starter === 'report' && turn.reply >= 0;
    if (!foldableTurn) {
      close();
      continue;
    }
    const s = replyState(messages[turn.reply].content as string);
    if (state !== null && s !== state) close();
    state = s;
    run.push(turn);
  }
  close();
  return folds;
}

/** The fold of every hidden message, by message. Messages not in the map are shown as they are. */
export function foldRepeatedReplies(messages: ChatMessage[], seen: ReadonlySet<string> = new Set()): Map<ChatMessage, ReplyFold> {
  return foldRuns(messages, segmentTurns(messages), seen);
}
