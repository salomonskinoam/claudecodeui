import assert from 'node:assert/strict';

import { test } from 'vitest';

import { workOf, workTabId } from '@/shared/hooks/useSplitPane';
import { agentRef, outputFileOf, outputRef, setWorkTitle } from '@/modules/chat/work/workTabs';

test('quests: a work tab id round-trips its kind and ref, slashes included', () => {
  const agent = workTabId('agent', agentRef('8ade61bb-1', 'a3f9'));
  assert.deepEqual(workOf(agent), { kind: 'agent', ref: '8ade61bb-1/a3f9' });
  const file = '/tmp/claude-1000/-home-noam-src-noam-worlds/0fbea6ac-4450-4870-a6ab-d42aa8c20c96/tasks/bwy06286r.output';
  const output = workTabId('output', outputRef(file));
  assert.deepEqual(workOf(output), { kind: 'output', ref: file.slice(1) });
  assert.equal(workOf('plan:x'), null);
  assert.equal(workOf('8ade61bb-1'), null);
});

test('quests: the output file comes from the live task event, else from the launch result', () => {
  const file = '/tmp/claude-1000/-p/0fbea6ac-4450-4870-a6ab-d42aa8c20c96/tasks/bwy06286r.output';
  assert.equal(outputFileOf({ taskStatus: { status: 'running', outputFile: file }, toolResult: null }), file);
  assert.equal(outputFileOf({ toolResult: { content: `Command running in background with ID: x\n<output-file>${file}</output-file>` } as never }), file);
  assert.equal(outputFileOf({ toolResult: { content: 'done' } as never }), undefined);
});

test('quests: a work tab title is kept per tab id', () => {
  setWorkTitle('work:agent:s/a', 'Agent: survey the repo');
  assert.equal(JSON.parse(localStorage.getItem('quests-work-titles') ?? '{}')['work:agent:s/a'], 'Agent: survey the repo');
});
