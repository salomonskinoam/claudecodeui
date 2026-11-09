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
      : e.waitsForMe && (e.state === 'question' || e.state === 'done') ? `Waits for you: ${e.state === 'done' ? 'a Done to approve' : 'a question'}${line ? ` (${line})` : ''}`
        : e.state === 'waiting' ? `Waits for something else, not you${line ? `: ${line}` : ''}`
          : e.state === 'blocker' ? `Blocked${line ? `: ${line}` : ''}`
            : e.state === 'unclaimed' ? 'Ticket no chat has claimed'
              : e.live ? 'Idle: its last reply has no closing line' : 'No process';
  const m = e.marks;
  const listening = m.includes('listener') || m.includes('listenerSilent');
  // A chat waiting or blocked with no process and no listener: nothing will wake it.
  const asleep = !e.live && !listening && (e.state === 'waiting' || e.state === 'blocker') ? '. No process and no listener: nothing will wake it' : '';
  const found = m.includes('hung') ? '. May be hung: no output for 30 minutes and no worker running'
    : m.includes('keepsDying') ? '. Its process keeps dying: woken 3 times in an hour, not again'
      : m.includes('listenerEnded') ? '. A listener ended, and the chat (open in Cursor) has not seen it'
        : m.includes('listenerSilent') ? '. A listener runs, but its log has been silent for 2 hours'
          : m.includes('listener') ? '. A listener runs and will wake it' : '';
  const where = e.placement === 'hold' ? 'On hold until its next activity. '
    : e.placement === 'archive' ? 'Archived until its next activity. ' : '';
  const seen = dot === 'done' ? 'Turn ended, not seen yet. ' : dot === 'workers' ? 'Its workers run. ' : '';
  return `${where}${seen}${why}${asleep}${found}`;
}
