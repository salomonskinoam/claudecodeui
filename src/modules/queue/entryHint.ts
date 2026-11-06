import type { ChatDot } from '@/shared/hooks/useLiveChats';
import type { QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: the second line of a line's hover, under its name. Why the entry sits in its drawer, in
 * words, and whether its last turn was seen. Two separate facts: "Pending" means the chat waits for Noam's input
 * (a question, a Done to approve, a permission prompt); the orange dot means its turn ended while he was not
 * looking. A chat in "Active" can carry the orange dot: its turn ended unseen, and it waits for something that is
 * not Noam. Noam, 6 Nov: "i want to differentiate between these states either by correct association to a
 * drawer, or by a more accurate on-hover hint".
 */
export function entryHint(e: QueueEntry, dot: ChatDot | undefined): string {
  const line = e.closingLine ? e.closingLine.replace(/^(\S+( for)?)\s*/, '').trim() : '';
  const why = e.state === 'permission' ? 'Waits for you: a permission prompt'
    : e.state === 'running' ? 'Running'
      : e.kind === 'chat' && e.sessionId && !e.started ? 'Not started: you have not written in it; it only ran on its own'
      : e.waitsForMe ? `Waits for you: ${e.state === 'done' ? 'a Done to approve' : 'a question'}${line ? ` (${line})` : ''}`
        : e.state === 'waiting' ? `Waits for something else, not you${line ? `: ${line}` : ''}`
          : e.state === 'blocker' ? `Blocked${line ? `: ${line}` : ''}`
            : e.state === 'unclaimed' ? 'Ticket no chat has claimed'
              : e.live ? 'Idle: its last reply has no closing line' : 'No process';
  // A chat waiting or blocked with no process: nothing runs in it, so nothing will wake it.
  const asleep = !e.live && (e.state === 'waiting' || e.state === 'blocker') ? '. No process: nothing will wake it' : '';
  const where = e.placement === 'hold' ? 'On hold until its next activity. '
    : e.placement === 'archive' ? 'Archived until its next activity. ' : '';
  const seen = dot === 'done' ? 'Turn ended, not seen yet. ' : '';
  return `${where}${seen}${why}${asleep}`;
}
