import assert from 'node:assert/strict';

import { test } from 'vitest';

import { foldRepeatedReplies, replyState, segmentTurns, starterOf } from '@/modules/chat/utils/repeatedReplies';
import type { ChatMessage } from '@/shared/types';

// Each row's id is its timestamp here, so a fold id reads as the time of its first folded reply.
const reply = (ts: string, text: string): ChatMessage => ({ id: ts, type: 'assistant', content: text, timestamp: ts } as ChatMessage);
const typed = (ts: string, text: string): ChatMessage => ({ id: ts, type: 'user', content: text, timestamp: ts } as ChatMessage);
const tool = (ts: string): ChatMessage => ({ id: ts, type: 'assistant', isToolUse: true, toolName: 'Bash', toolId: ts, timestamp: ts } as ChatMessage);
const report = (ts: string): ChatMessage => ({ id: ts, type: 'assistant', content: 'Monitor event: "proof runs results"', timestamp: ts, isTaskNotification: true } as ChatMessage);
const hook = (ts: string): ChatMessage => ({ id: ts, type: 'assistant', agentReportFrom: 'the stop hook', content: 'no closing line', timestamp: ts } as ChatMessage);
const note = (ts: string, noteKind: 'interrupt' | 'tools'): ChatMessage => ({ id: ts, type: 'assistant', content: 'note', timestamp: ts, noteKind } as ChatMessage);

const STATE = 'Running: 6 evaluation runs, with a watcher.\nRequired from you: nothing.\nwaiting for the other 6 runs.';
const STATE2 = 'Running:\n- 6 more runs on shared datasets;\n- the detached watcher.\nRequired from you: nothing.\nwaiting for the remaining run results.';

test('step 1: starters and turns', () => {
  assert.equal(starterOf(typed('t', 'hi')), 'typed');
  assert.equal(starterOf(report('t')), 'report');
  assert.equal(starterOf(hook('t')), 'hook');
  assert.equal(starterOf({ type: 'assistant', agentReportFrom: 'agent a1', content: 'x' } as ChatMessage), 'agent');
  assert.equal(starterOf(reply('t', 'x')), 'none');
  assert.equal(starterOf(tool('t')), 'none');
  assert.equal(starterOf(note('t', 'interrupt')), 'typed');
  assert.equal(starterOf(note('t', 'tools')), 'none');
  const turns = segmentTurns([typed('t0', 'go'), tool('t1'), reply('t2', 'done'), report('t3'), reply('t4', 'again'), hook('t5'), reply('t6', 'lines')]);
  assert.deepEqual(turns.map((t) => [t.starter, t.start, t.end, t.reply]), [['typed', 0, 3, 2], ['report', 3, 5, 4], ['hook', 5, 7, 6]]);
});

test('step 2: the state of a reply is what it asks of Noam', () => {
  assert.equal(replyState(`rag-hotpot-base completed.\n\n${STATE}`), replyState(`I restarted the watcher.\n${STATE2}`));
  assert.notEqual(replyState(`x\nRequired from you: nothing.\nwaiting for y`), replyState(`x\nRequired from you: item 3.\nquestion the restart`));
  assert.notEqual(replyState(`x\nRequired from you: item 3.\nquestion the restart`), replyState(`x\nRequired from you: item 3.\nquestion the lock`));
  assert.equal(replyState('second done'), 'second done');
});

test('step 3: only turns Noam did not start fold, all but the last of a run with one state', () => {
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

test('step 3: a turn the hook forced is no reply; agents and listeners join a run; a woken turn without a reply is skipped', () => {
  const agent = (ts: string): ChatMessage => ({ id: ts, type: 'assistant', agentReportFrom: 'noam-worlds-cf', content: 'sdk notice', timestamp: ts } as ChatMessage);
  const m = [
    typed('t0', 'brief'),
    reply('t1', `the brief.\n${STATE}`), hook('t2'), reply('t3', `Running: nothing\n${STATE}`),
    report('t4'), reply('t5', `a.\n${STATE}`),
    agent('t6'), reply('t7', `b.\n${STATE}`),
    agent('t8'),
    typed('t9', 'Message from the quests manager: your listener "x" ended'), reply('t10', `c.\n${STATE}`),
  ];
  assert.equal(starterOf(m[9]), 'report');
  // t1, sent back by the hook, folds under its rewrite t3; t5 and t7 fold; the reply-less agent turn t8 stays drawn and does not break the run; t10 is the last and shows.
  assert.deepEqual([...foldRepeatedReplies(m).keys()].map((x) => x.timestamp), ['t1', 't2', 't4', 't5', 't6', 't7']);
});

test('step 1: a finished reply starts the next woken turn, since the server does not serve what woke the chat', () => {
  const end = (what: string) => `Running: x\nRequired from you: nothing\n**Done:** ${what}`;
  const m = [
    typed('t0', 'is it live?'), reply('t1', `**Summary**\n- **201.** "is it live?" Partly.\n${end('the hook is live')}`),
    reply('t2', end('the hook is live')), tool('t3'), reply('t4', end('the hook is live')),
    typed('t5', 'next'), tool('t6'), reply('t7', 'working'), reply('t8', end('next')),
  ];
  assert.deepEqual(segmentTurns(m).map((t) => [t.starter, t.start, t.reply]), [['typed', 0, 1], ['report', 2, 2], ['report', 3, 4], ['typed', 5, 8]]);
  // The answer to Noam stays; of the two equal woken replies the last shows.
  assert.deepEqual([...foldRepeatedReplies(m).keys()].map((x) => x.timestamp), ['t2']);
});

test('step 3: a reply the stop hook sent back folds under its rewrite', () => {
  const end = 'Running: x\nRequired from you: nothing\nwaiting for: the agents';
  const m = [
    typed('t0', 'do the dupe analysis'), tool('t1'), reply('t2', `- **175.** "dupe analysis" started.\n${end}`),
    hook('t3'), reply('t4', `**Summary**\n- **175.** "dupe analysis" started.\n${end}`),
  ];
  const folds = foldRepeatedReplies(m);
  assert.deepEqual([...folds.keys()].map((x) => x.timestamp), ['t2', 't3']);
  assert.deepEqual(folds.get(m[2]), { id: 't2', count: 1, from: 't2', to: 't2', first: true });
});
