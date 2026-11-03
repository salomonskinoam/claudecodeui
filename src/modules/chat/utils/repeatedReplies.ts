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
 * when, and shows them on click. The last reply, the newest word, stays. A reply without the closing block and
 * its re-send after the stop hook's feedback have different states, so they never fold into each other.
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
  m.type === 'assistant' && !m.isToolUse && !m.isThinking && !m.isTaskNotification && !m.agentReportFrom
  && typeof m.content === 'string' && m.content.trim() !== '';

/** A row that starts a turn: a user row, a task's report, or what a hook or an agent handed in (framed rows). */
const startsTurn = (m: ChatMessage): boolean => (m.type === 'user' && !m.isToolUse) || Boolean(m.isTaskNotification) || Boolean(m.agentReportFrom);

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
  type Turn = { start: number; reply: number; state: string };
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
  const endTurn = (start: number, reply: number, hookTurn: boolean) => {
    // A turn the stop hook forced (its feedback starts it) only re-sends the closing lines: it is no reply of
    // its own and never folds the reply before it, which holds the content (Noam, 2 Nov: "it collapsed all
    // model text that came before it").
    if (reply < 0 || hookTurn) return;
    const text = messages[reply].content as string;
    const state = replyState(text);
    const turn: Turn = { start, reply, state };
    const previous = run[run.length - 1];
    // A reply the stop hook sent back and its re-send never fold into each other: the first holds the content,
    // the re-send often only the closing lines (Noam, 2 Nov: "it collapsed all model text that came before it").
    if (previous && previous.state !== state) close();
    run.push(turn);
  };
  let start = 0;
  let reply = -1;
  let hookTurn = false;
  messages.forEach((m, i) => {
    if (startsTurn(m)) {
      endTurn(start, reply, hookTurn);
      const typed = isTyped(m);
      if (typed) close();
      // A typed message is never hidden; a report or a hook's feedback belongs to the turn it starts.
      start = typed ? i + 1 : i;
      reply = -1;
      hookTurn = m.agentReportFrom === 'the stop hook';
      return;
    }
    if (isReply(m)) reply = i;
  });
  endTurn(start, reply, hookTurn);
  close();
  return folds;
}
