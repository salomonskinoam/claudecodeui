import type { ChatMessage } from '@/shared/types';

/**
 * quests: replies that repeat are folded (requirement 39). Three small steps, each on its own:
 *
 *   1. segmentTurns   the transcript as turns: each starts with a starter row (a message Noam typed, a task's
 *                     report, something a hook or an agent handed in) and ends before the next; its reply is
 *                     its last text.
 *   2. replyState     what a reply asks of Noam: its "Required from you:" line plus the kind of its closing line.
 *   3. foldRuns       which turns fold: only turns a REPORT started (a watcher's loop), in a run of two or more
 *                     with the same state, all but the last. A turn Noam's own message started never folds: the
 *                     answer to his message always shows. A turn a hook started is no reply of its own. A turn
 *                     whose reply Noam has already seen on this page never folds later.
 *
 * Noam, 2 Nov: "i saw uncollapsed correctly, and then when i sent another message it collapsed things i just
 * read" and "have the requirements clear first and then have things with single responsibility".
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
  /** The run's id: the timestamp of its first folded reply. */
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
  m.type === 'assistant' && !m.isToolUse && !m.isThinking && !m.isTaskNotification && !m.agentReportFrom
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

/**
 * Step 3: the folds. `seen` holds the timestamps of replies Noam has already had on screen on this page: a turn
 * with such a reply never folds later.
 */
export function foldRuns(messages: ChatMessage[], turns: Turn[], seen: ReadonlySet<string> = new Set()): Map<ChatMessage, ReplyFold> {
  const folds = new Map<ChatMessage, ReplyFold>();
  const stamp = (turn: Turn) => messages[turn.reply].timestamp ?? String(turn.reply);
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
        from: stamp(hidden[0]),
        to: stamp(hidden[hidden.length - 1]),
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
