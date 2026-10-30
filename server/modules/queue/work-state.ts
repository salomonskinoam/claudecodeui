import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { sessionsDb } from '@/modules/database/index.js';
import { describeToolCall, getClaudeSDKLastStep } from '@/modules/providers/index.js';
import { getChats } from '@/modules/queue/chats.js';
import { stateOf } from '@/modules/queue/entries.js';
import { getOpenTasks, type OpenTask } from '@/modules/queue/sources/transcripts.js';
import { findTaskOutputFile } from '@/modules/queue/work.js';

/**
 * quests: the state of the main chat apart from the states of its workers (requirement 40), read from what is
 * on this machine: the live processes (the registry), the transcript (the closing line, the tasks launched and
 * not yet reported), the agents' transcripts and the tasks' output files. Nothing here depends on what the page
 * remembers, so a reload changes nothing.
 */

export type MainState = {
  state: 'answering' | 'permission' | 'question' | 'done' | 'waiting' | 'blocker' | 'idle';
  step: string | null;
  text: string | null;
  since: number | null;
};

export type Worker = {
  taskId: string;
  kind: OpenTask['kind'];
  name: string;
  step: string | null;
  startedAt: number | null;
  lastActivityAt: number | null;
  tab: { kind: 'agent' | 'task'; ref: string } | null;
};

export type WorkState = { main: MainState; workers: Worker[] };

/** The last 4 KB of a file, and its modification time; null when the file is not there. */
async function tailOf(file: string): Promise<{ text: string; modifiedAt: number } | null> {
  let handle;
  try {
    handle = await fsp.open(file, 'r');
  } catch {
    return null;
  }
  try {
    const { size, mtimeMs } = await handle.stat();
    const start = Math.max(0, size - 4096);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return { text: buffer.toString('utf8'), modifiedAt: mtimeMs };
  } finally {
    await handle.close();
  }
}

/** An agent's last step from the tail of its transcript: its last tool call, else the head of its last text. */
function agentStep(tail: string): string | null {
  const lines = tail.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let row: { type?: string; message?: { content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> } };
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (row.type !== 'assistant') continue;
    for (const block of [...(row.message?.content ?? [])].reverse()) {
      if (block.type === 'tool_use') return describeToolCall(String(block.name ?? 'Tool'), block.input);
      if (block.type === 'text' && block.text?.trim()) return block.text.trim().split('\n', 1)[0].slice(0, 70);
    }
  }
  return null;
}

/** The last non-empty line of a command's output. */
const lastLine = (text: string): string | null => text.split('\n').map((l) => l.trim()).filter(Boolean).pop()?.slice(0, 90) ?? null;

async function workerOf(task: OpenTask, appSessionId: string, providerSessionId: string, transcriptPath: string | null): Promise<Worker> {
  const base = { taskId: task.taskId || task.toolUseId, kind: task.kind, name: task.name, startedAt: task.startedAt ? Date.parse(task.startedAt) : null };
  if (task.kind === 'agent' && task.taskId && transcriptPath) {
    const file = path.join(path.dirname(transcriptPath), providerSessionId, 'subagents', `agent-${task.taskId}.jsonl`);
    const tail = await tailOf(file);
    return { ...base, step: tail ? agentStep(tail.text) : null, lastActivityAt: tail?.modifiedAt ?? null, tab: { kind: 'agent', ref: `${appSessionId}/${task.taskId}` } };
  }
  if (task.kind === 'workflow' || !task.taskId) {
    return { ...base, step: null, lastActivityAt: null, tab: null };
  }
  const file = findTaskOutputFile(providerSessionId, task.taskId);
  const tail = file ? await tailOf(file) : null;
  return { ...base, step: tail ? lastLine(tail.text) : null, lastActivityAt: tail?.modifiedAt ?? null, tab: { kind: 'task', ref: `${appSessionId}/${task.taskId}` } };
}

export async function readWorkState(appSessionId: string): Promise<WorkState | null> {
  const row = sessionsDb.getSessionById(appSessionId);
  if (!row) return null;
  const sid = row.provider_session_id ?? appSessionId;
  const chat = getChats().get(sid);
  const queueState = chat ? stateOf(chat) : { state: 'none' as const, since: 0 };
  const step = getClaudeSDKLastStep(appSessionId);
  const main: MainState = {
    state: queueState.state === 'running' ? 'answering' : queueState.state === 'none' || queueState.state === 'unclaimed' ? 'idle' : queueState.state,
    step: queueState.state === 'running' ? step?.text ?? null : null,
    text: chat?.closingLine && queueState.state !== 'running' && queueState.state !== 'permission' ? chat.closingLine.text : null,
    since: queueState.since || null,
  };
  const workers = await Promise.all(getOpenTasks(sid).map((task) => workerOf(task, appSessionId, sid, row.jsonl_path ?? null)));
  return { main, workers };
}
