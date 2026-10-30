import type { ChatMessage } from '@/shared/types';

/**
 * quests: replies that repeat are folded. A chat on a watcher loop answers every report, and says the same thing
 * each time while nothing changes; Noam, 30 Oct: "i dont understand how to filter this to see the repeating part
 * only when it matters and not a million times, especially in a row".
 *
 * The rule. A reply's STATE is what it asks of Noam: its "Required from you:" line, plus the kind of its closing
 * line ("waiting for" alone, since the wording of a wait changes with every report; "question", "blocker" and
 * "Done" with their whole line, since a new question is a new state). A reply without the "Required from you:"
 * line has its whole text as its state (exact repeats). Between two messages Noam typed, consecutive replies
 * with the same state form a run. In a run of two or more, every reply but the last is folded, with everything between
 * it and the last reply (the steps and reports in between): one line says how many replies said the same and
 * when, and shows them on click. The last reply, the newest word, stays.
 */

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

/** The state of a reply: its "Required from you:" line and the kind of its closing line, else its whole text. */
export function replyState(text: string): string {
  const lines = text.split('\n').map((l) => normalize(l.replace(/\*\*/g, ''))).filter(Boolean);
  const required = [...lines].reverse().find((l) => /^Required from you:/i.test(l));
  if (!required) return normalize(text);
  const last = lines[lines.length - 1] ?? '';
  const kind = /^(waiting for|question|blocker|done)\b/i.exec(last)?.[1].toLowerCase() ?? '';
  return `${required.toLowerCase()} | ${kind === 'waiting for' ? kind : last.toLowerCase()}`;
}

const isReply = (m: ChatMessage): boolean =>
  m.type === 'assistant' && !m.isToolUse && !m.isThinking && !m.isTaskNotification && typeof m.content === 'string' && m.content.trim() !== '';

/** A row that starts a turn: a user row (typed, or a hook's feedback), or a task's report (shown as an assistant row). */
const startsTurn = (m: ChatMessage): boolean => (m.type === 'user' && !m.isToolUse) || Boolean(m.isTaskNotification);

/** A message Noam typed: a user row that is not a hook's feedback (the hook writes as the user). */
const isTyped = (m: ChatMessage): boolean => {
  if (m.type !== 'user' || m.isToolUse || typeof m.content !== 'string') return false;
  const head = m.content.trimStart();
  return !head.startsWith('Stop hook feedback') && !head.startsWith('<system-reminder>');
};

/**
 * The fold of every hidden message, by message. Messages not in the map are shown as they are.
 *
 * A TURN is what one user row starts (a typed message, a task's report, a hook's feedback): its tool calls, its
 * texts along the way, and its REPLY, the last text before the next user row. The reply's state is the turn's.
 */
export function foldRepeatedReplies(messages: ChatMessage[]): Map<ChatMessage, ReplyFold> {
  const folds = new Map<ChatMessage, ReplyFold>();
  type Turn = { start: number; reply: number; state: string; whole: boolean };
  let run: Turn[] = [];
  const close = () => {
    if (run.length >= 2) {
      const first = run[0];
      const lastShown = run[run.length - 1];
      const fold: Omit<ReplyFold, 'first'> = {
        id: messages[first.reply].timestamp ?? String(first.reply),
        count: run.length - 1,
        from: messages[first.reply].timestamp ?? '',
        to: messages[run[run.length - 2].reply].timestamp ?? '',
      };
      for (let i = first.start; i < lastShown.start; i += 1) {
        folds.set(messages[i], { ...fold, first: i === first.start });
      }
    }
    run = [];
  };
  const endTurn = (start: number, reply: number) => {
    if (reply < 0) return;
    const text = messages[reply].content as string;
    const state = replyState(text);
    const turn: Turn = { start, reply, state, whole: state === normalize(text) };
    const previous = run[run.length - 1];
    // The hook's re-send: a reply without the closing line, then the same reply with it. Same run.
    const resend = previous?.whole && normalize(text).startsWith(previous.state);
    if (previous && previous.state !== state && !resend) close();
    run.push(turn);
  };
  let start = 0;
  let reply = -1;
  messages.forEach((m, i) => {
    if (startsTurn(m)) {
      endTurn(start, reply);
      const typed = isTyped(m);
      if (typed) close();
      // A typed message is never hidden; a report or a hook's feedback belongs to the turn it starts.
      start = typed ? i + 1 : i;
      reply = -1;
      return;
    }
    if (isReply(m)) reply = i;
  });
  endTurn(start, reply);
  close();
  return folds;
}
