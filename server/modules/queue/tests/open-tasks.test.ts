import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openTasksOf } from '../sources/transcripts.js';

const launch = (id: string, name: string, input: Record<string, unknown>, ts = '2026-10-30T20:00:00Z') =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', id, name, input }] } });
const ack = (toolUseId: string, toolUseResult: Record<string, unknown>) =>
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] }, toolUseResult });
const report = (body: string) => JSON.stringify({ type: 'user', message: { content: `<task-notification>\n${body}` } });

test('quests: the open tasks are the launches without an end report; a synchronous agent and an orphan summary close', () => {
  const lines = [
    launch('t_agent', 'Agent', { description: 'Diagnose rlhf run failure', prompt: 'x', run_in_background: true }),
    ack('t_agent', { isAsync: true, status: 'async_launched', agentId: 'a7238bce' }),
    launch('t_sync', 'Agent', { description: 'Read one file', prompt: 'x' }),
    ack('t_sync', { status: 'completed', agentId: 'a1111111' }),
    launch('t_bash', 'Bash', { command: 'python watch.py', description: 'rlhf runs', run_in_background: true }),
    ack('t_bash', { backgroundTaskId: 'bplomq0l1' }),
    launch('t_bash_done', 'Bash', { command: 'sleep 45', run_in_background: true }),
    ack('t_bash_done', { backgroundTaskId: 'b3yekap4x' }),
    report('<task-id>b3yekap4x</task-id>\n<tool-use-id>t_bash_done</tool-use-id>\n<status>completed</status>\n<summary>done</summary>'),
    launch('t_mon', 'Monitor', { command: 'tail -f x.log', description: 'rlhf and rag4 run results' }),
    ack('t_mon', { taskId: 'bjktzjlxp', timeoutMs: 1800000 }),
    report('<task-id>bjktzjlxp</task-id>\n<summary>Monitor event: "rlhf and rag4 run results"</summary>'),
    launch('t_mon_old', 'Monitor', { command: 'tail -f y.log', description: 'older watcher' }),
    ack('t_mon_old', { taskId: 'bmfu0xlzs', timeoutMs: 1800000 }),
    report('<task-id>bmfu0xlzs</task-id>\n<task-id>__orphan_summary__:shell</task-id>\n<status>stopped</status>\n<summary>1 background shell command task didn\'t finish</summary>'),
    launch('t_plain', 'Bash', { command: 'ls' }),
  ];
  const open = openTasksOf(lines);
  assert.deepEqual(open.map((t) => [t.kind, t.taskId, t.name]), [
    ['agent', 'a7238bce', 'Diagnose rlhf run failure'],
    ['command', 'bplomq0l1', 'rlhf runs'],
    ['watcher', 'bjktzjlxp', 'rlhf and rag4 run results'],
  ]);
  assert.equal(open[0].startedAt, '2026-10-30T20:00:00Z');
});
