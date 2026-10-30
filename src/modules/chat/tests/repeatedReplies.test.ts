import assert from 'node:assert/strict';

import { test } from 'vitest';

import { foldRepeatedReplies, replyState } from '@/modules/chat/utils/repeatedReplies';
import type { ChatMessage } from '@/shared/types';

const reply = (ts: string, text: string): ChatMessage => ({ type: 'assistant', content: text, timestamp: ts } as ChatMessage);
const typed = (ts: string, text: string): ChatMessage => ({ type: 'user', content: text, timestamp: ts } as ChatMessage);
const tool = (ts: string): ChatMessage => ({ type: 'assistant', isToolUse: true, toolName: 'Bash', toolId: ts, timestamp: ts } as ChatMessage);

const STATE = 'Running: 6 evaluation runs, with a watcher.\nRequired from you: nothing.\nwaiting for the other 6 runs.';
const STATE2 = 'Running:\n- 6 more runs on shared datasets;\n- the detached watcher.\nRequired from you: nothing.\nwaiting for the remaining run results.';

test('quests: the state of a reply is what it asks of Noam: the Required line and the kind of wait', () => {
  // Two waits worded differently are one state; a wait and a question are not; two questions differ.
  assert.equal(replyState(`rag-hotpot-base completed with score 0.90.\n\n${STATE}`), replyState(`I restarted the watcher.\n${STATE2}`));
  assert.notEqual(replyState(`x\nRequired from you: nothing.\nwaiting for y`), replyState(`x\nRequired from you: item 3.\nquestion the restart`));
  assert.notEqual(replyState(`x\nRequired from you: item 3.\nquestion the restart`), replyState(`x\nRequired from you: item 3.\nquestion the lock`));
  assert.equal(replyState(`x\n**Required from you:** item 3.\nDone the work`), replyState(`y\nRequired from you: item 3.\ndone the work`));
  assert.equal(replyState('second done'), 'second done');
});

test('quests: turns whose reply has one state fold, all but the last; a typed message or a new state ends the run', () => {
  // A task's report, as the page shows it: an assistant row flagged as a notification.
  const report = (ts: string): ChatMessage => ({ type: 'assistant', content: 'Monitor event: "proof runs results"', timestamp: ts, isTaskNotification: true } as ChatMessage);
  const m = [
    typed('t0', 'watch the runs'),
    reply('t1', 'Looking at the runs.'), // a text along the way, not the reply
    tool('t2'),
    reply('t3', `rag-hotpot-base completed.\n${STATE}`),
    report('t4'),
    tool('t5'),
    reply('t6', `I restarted the watcher.\n${STATE2}`),
    report('t7'),
    reply('t8', 'One subagent reads the logs.'),
    tool('t9'),
    reply('t10', `rag-hotpot-base is graded.\n${STATE}`),
    report('t11'),
    reply('t12', 'all back.\nRunning: nothing.\nRequired from you: nothing.\nDone the catalogue.'),
    typed('t13', 'thanks'),
    reply('t14', 'ok.\nRunning: nothing.\nRequired from you: nothing.\nDone the catalogue.'),
  ];
  const folds = foldRepeatedReplies(m);
  // The turns ending at t3 and t6 fold with everything up to the start of the turn ending at t10 (its report t7).
  assert.deepEqual([...folds.keys()].map((x) => x.timestamp), ['t1', 't2', 't3', 't4', 't5', 't6']);
  assert.deepEqual(folds.get(m[1]), { id: 't3', count: 2, from: 't3', to: 't6', first: true });
  assert.equal(folds.get(m[6])?.first, false);
  assert.equal(folds.has(m[7]), false);
  assert.equal(folds.has(m[10]), false);
  assert.equal(folds.has(m[12]), false, 'a new state (Done) is shown');
  assert.equal(folds.has(m[14]), false, 'after a typed message the run starts over');
});

test('quests: a lone reply, or replies that differ, never fold', () => {
  assert.equal(foldRepeatedReplies([reply('a', `one\n${STATE}`)]).size, 0);
  assert.equal(foldRepeatedReplies([reply('a', 'first done'), reply('b', 'second done')]).size, 0);
  // Two texts in one turn are one turn: nothing folds. The hook's re-send (the same reply, the closing block added) does.
  assert.equal(foldRepeatedReplies([reply('a', 'second done'), reply('b', 'second done')]).size, 0);
  const hook = { type: 'user', content: 'Stop hook feedback: no closing line', timestamp: 'h' } as ChatMessage;
  // The first attempt folds; the hook's feedback starts the shown turn, so it stays.
  assert.equal(foldRepeatedReplies([reply('a', 'second done'), hook, reply('b', `second done\n${STATE}`)]).size, 1);
});
