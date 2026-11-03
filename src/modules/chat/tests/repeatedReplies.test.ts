import assert from 'node:assert/strict';

import { test } from 'vitest';

import { foldRepeatedReplies, replyState, segmentTurns, starterOf } from '@/modules/chat/utils/repeatedReplies';
import type { ChatMessage } from '@/shared/types';

const reply = (ts: string, text: string): ChatMessage => ({ type: 'assistant', content: text, timestamp: ts } as ChatMessage);
const typed = (ts: string, text: string): ChatMessage => ({ type: 'user', content: text, timestamp: ts } as ChatMessage);
const tool = (ts: string): ChatMessage => ({ type: 'assistant', isToolUse: true, toolName: 'Bash', toolId: ts, timestamp: ts } as ChatMessage);
const report = (ts: string): ChatMessage => ({ type: 'assistant', content: 'Monitor event: "proof runs results"', timestamp: ts, isTaskNotification: true } as ChatMessage);
const hook = (ts: string): ChatMessage => ({ type: 'assistant', agentReportFrom: 'the stop hook', content: 'no closing line', timestamp: ts } as ChatMessage);

const STATE = 'Running: 6 evaluation runs, with a watcher.\nRequired from you: nothing.\nwaiting for the other 6 runs.';
const STATE2 = 'Running:\n- 6 more runs on shared datasets;\n- the detached watcher.\nRequired from you: nothing.\nwaiting for the remaining run results.';

test('step 1: starters and turns', () => {
  assert.equal(starterOf(typed('t', 'hi')), 'typed');
  assert.equal(starterOf(report('t')), 'report');
  assert.equal(starterOf(hook('t')), 'hook');
  assert.equal(starterOf({ type: 'assistant', agentReportFrom: 'agent a1', content: 'x' } as ChatMessage), 'agent');
  assert.equal(starterOf(reply('t', 'x')), 'none');
  assert.equal(starterOf(tool('t')), 'none');
  const turns = segmentTurns([typed('t0', 'go'), tool('t1'), reply('t2', 'done'), report('t3'), reply('t4', 'again'), hook('t5'), reply('t6', 'lines')]);
  assert.deepEqual(turns.map((t) => [t.starter, t.start, t.end, t.reply]), [['typed', 0, 3, 2], ['report', 3, 5, 4], ['hook', 5, 7, 6]]);
});

test('step 2: the state of a reply is what it asks of Noam', () => {
  assert.equal(replyState(`rag-hotpot-base completed.\n\n${STATE}`), replyState(`I restarted the watcher.\n${STATE2}`));
  assert.notEqual(replyState(`x\nRequired from you: nothing.\nwaiting for y`), replyState(`x\nRequired from you: item 3.\nquestion the restart`));
  assert.notEqual(replyState(`x\nRequired from you: item 3.\nquestion the restart`), replyState(`x\nRequired from you: item 3.\nquestion the lock`));
  assert.equal(replyState('second done'), 'second done');
});

test('step 3: only report-started turns fold, all but the last of a run with one state', () => {
  const m = [
    typed('t0', 'watch the runs'),
    reply('t1', `started.\n${STATE}`), // the answer to Noam's message: never folds
    report('t2'), tool('t3'), reply('t4', `rag completed.\n${STATE}`),
    report('t5'), reply('t6', `restarted the watcher.\n${STATE2}`),
    report('t7'), reply('t8', `rag graded.\n${STATE}`),
    report('t9'), reply('t10', 'all back.\nRunning: nothing.\nRequired from you: nothing.\nDone the catalogue.'),
    typed('t11', 'thanks'),
    reply('t12', 'ok.\nRunning: nothing.\nRequired from you: nothing.\nDone the catalogue.'),
  ];
  const folds = foldRepeatedReplies(m);
  // The report turns ending at t4 and t6 fold (rows t2..t6); t8 is the run's last; t10 is a new state; t1 and t12 answer Noam.
  assert.deepEqual([...folds.keys()].map((x) => x.timestamp), ['t2', 't3', 't4', 't5', 't6']);
  assert.deepEqual(folds.get(m[2]), { id: 't4', count: 2, from: 't4', to: 't6', first: true });
  assert.equal(folds.has(m[1]), false);
  assert.equal(folds.has(m[8]), false);
  assert.equal(folds.has(m[12]), false);
});

test('step 3: a turn the hook forced is no reply; a reply already seen never folds later', () => {
  const m = [
    typed('t0', 'brief'),
    reply('t1', `the brief.\n${STATE}`), hook('t2'), reply('t3', `Running: nothing\n${STATE}`),
    report('t4'), reply('t5', `a.\n${STATE}`), report('t6'), reply('t7', `b.\n${STATE}`),
  ];
  assert.deepEqual([...foldRepeatedReplies(m).keys()].map((x) => x.timestamp), ['t4', 't5']);
  // Noam had t5 on screen already: it stays.
  assert.equal(foldRepeatedReplies(m, new Set(['t5'])).size, 0);
});
