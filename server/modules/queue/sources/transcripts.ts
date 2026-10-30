import { promises as fs } from 'node:fs';
import path from 'node:path';

import { queueDb } from '@/modules/database/index.js';

/**
 * quests priority queue, source: what a chat's transcript says about it. Its last closing line (stored in
 * queue_chats), whether /finalize-chat ran in it, and its name (the rename, else Claude's generated title).
 * Read on every transcript change (the session watcher calls noteTranscript) and at start for recent chats.
 */

const CLOSING = /^(waiting for|question|blocker|done)\b[ :]*(.+)$/i;
const FINALIZE = '<command-name>/finalize-chat</command-name>';
// A /finalize-chat run writes a lot (merges, audits): the command can sit hundreds of KB before the end
// (371 KB on 2026-10-14's "oct_12 Argus and rubrics before delivery"), so read 8 MB back.
const TAIL_BYTES = 8 * 1024 * 1024;

const titles = new Map<string, string>();
export const getTitles = () => titles;

/** A task the chat launched and that has not reported its end: a worker (requirement 40). */
export type OpenTask = {
  /** The id the reports name it by (an agent's id, a command's or watcher's task id); '' until its launch is acknowledged. */
  taskId: string;
  toolUseId: string;
  kind: 'agent' | 'command' | 'watcher' | 'workflow';
  name: string;
  startedAt: string | null;
};
const openTasks = new Map<string, OpenTask[]>();
export const getOpenTasks = (sid: string): OpenTask[] => openTasks.get(sid) ?? [];

const TERMINAL = new Set(['completed', 'failed', 'stopped', 'killed']);

/**
 * The tasks still open: every launch (an Agent call, a backgrounded Bash, a Monitor, a Workflow) whose task got
 * no report with an end status. A report names its task by `<task-id>` (an orphan summary names several), and
 * a launch's acknowledgement (the tool result's toolUseResult) ties the tool call to that id.
 */
export function openTasksOf(lines: string[]): OpenTask[] {
  const launches = new Map<string, OpenTask>();
  const closed = new Set<string>();
  const closedToolUse = new Set<string>();
  for (const line of lines) {
    if (line.includes('"tool_use"') && line.includes('"type":"assistant"')) {
      const row = parse(line);
      if (row?.type !== 'assistant' || row.isSidechain) continue;
      for (const b of row.message?.content ?? []) {
        if (b.type !== 'tool_use') continue;
        const input = b.input ?? {};
        const kind = b.name === 'Agent' && input.run_in_background !== false ? 'agent'
          : b.name === 'Bash' && input.run_in_background === true ? 'command'
            : b.name === 'Monitor' ? 'watcher' : b.name === 'Workflow' ? 'workflow' : null;
        if (!kind) continue;
        const name = String(input.description ?? input.command ?? input.prompt ?? '').split('\n', 1)[0].slice(0, 90);
        launches.set(b.id, { taskId: '', toolUseId: b.id, kind, name, startedAt: row.timestamp ?? null });
      }
    } else if (line.includes('"toolUseResult"') && line.includes('"type":"user"')) {
      const row = parse(line);
      const result = row?.toolUseResult;
      const toolUseId = Array.isArray(row?.message?.content) ? row.message.content.find((b: { type: string }) => b.type === 'tool_result')?.tool_use_id : undefined;
      const id = result?.agentId ?? result?.backgroundTaskId ?? result?.taskId;
      const launch = toolUseId ? launches.get(toolUseId) : undefined;
      if (launch && typeof id === 'string') launch.taskId = id;
      // A synchronous agent reports in its result at once: not a worker.
      if (launch && launch.kind === 'agent' && result && result.isAsync !== true && result.status !== 'async_launched') closedToolUse.add(toolUseId);
    } else if (line.includes('<task-notification>') && line.includes('"type":"user"')) {
      const row = parse(line);
      const text = typeof row?.message?.content === 'string' ? row.message.content
        : Array.isArray(row?.message?.content) ? row.message.content.map((b: { text?: string }) => b.text ?? '').join('\n') : '';
      for (const note of text.split('<task-notification>').slice(1)) {
        const status = /<status>([a-z_]+)<\/status>/.exec(note)?.[1];
        const ended = (status && TERMINAL.has(status)) || note.includes('Monitor expired');
        if (!ended) continue;
        for (const m of note.matchAll(/<task-id>([^<]+)<\/task-id>/g)) closed.add(m[1]);
        const toolUse = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(note)?.[1];
        if (toolUse) closedToolUse.add(toolUse);
      }
    }
  }
  return [...launches.values()].filter((t) => !closedToolUse.has(t.toolUseId) && !(t.taskId && closed.has(t.taskId)));
}

async function readTail(file: string, bytes: number): Promise<string[]> {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n');
    return start > 0 ? lines.slice(1) : lines;
  } finally {
    await handle.close();
  }
}

/** The JSON of a transcript line, or null for a line being written right now. */
function parse(line: string): Record<string, any> | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * The chat was finalized: a user turn ran the /finalize-chat command (the text alone also appears in replies
 * that talk about it), or the chat invoked the finalize-chat skill by words (a Skill tool call; the "oct_27 grpo
 * dupe check #45" chat finalized that way and stayed listed).
 */
const FINALIZE_SKILL = '"skill":"finalize-chat"';
const isFinalizeCommand = (line: string): boolean => {
  if (line.includes(FINALIZE) && line.includes('"type":"user"')) {
    const row = parse(line);
    return row?.type === 'user' && typeof row.message?.content === 'string' && row.message.content.includes(FINALIZE);
  }
  if (line.includes(FINALIZE_SKILL) && line.includes('"name":"Skill"')) {
    const row = parse(line);
    return row?.type === 'assistant' && (row.message?.content ?? []).some(
      (b: { type: string; name?: string; input?: { skill?: string } }) => b.type === 'tool_use' && b.name === 'Skill' && b.input?.skill === 'finalize-chat',
    );
  }
  return false;
};

/** The closing line of the last reply, with the reply's time. */
function closingLine(lines: string[]): { kind: string | null; text: string | null; at: string | null } {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('"type":"assistant"')) continue;
    const row = parse(lines[i]);
    if (!row || row.type !== 'assistant' || row.isSidechain) continue;
    const said = (row.message?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n');
    if (!said.trim()) continue;
    const last = said.split('\n').map((l: string) => l.trim()).filter(Boolean).pop() ?? '';
    const m = last.match(CLOSING);
    return { kind: m ? m[1].toLowerCase() : null, text: m ? m[2] : null, at: row.timestamp ?? null };
  }
  return { kind: null, text: null, at: null };
}

/** The newest value of a title line ("custom-title" holds the rename, "ai-title" Claude's title). */
function titleOf(lines: string[], type: string, field: string): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes(`"type":"${type}"`)) continue;
    const value = parse(lines[i])?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Reads a chat's transcript and stores what the queue needs from it. */
export async function noteTranscript(file: string): Promise<void> {
  if (!file.endsWith('.jsonl') || file.includes(`${path.sep}subagents${path.sep}`)) return;
  const sid = path.basename(file, '.jsonl');
  const lines = await readTail(file, TAIL_BYTES);
  const line = closingLine(lines);
  const name = titleOf(lines, 'custom-title', 'customTitle') ?? titleOf(lines, 'ai-title', 'aiTitle');
  if (name) titles.set(sid, name);
  openTasks.set(sid, openTasksOf(lines));
  queueDb.setChat({
    provider_session_id: sid,
    line_kind: line.kind,
    line_text: line.text,
    line_at: line.at,
    finalized: lines.some(isFinalizeCommand) ? 1 : 0,
  });
}

/** Reads a chat's transcript once, in the background, if it was never read (a chat that just appeared as a tab). */
const read = new Set<string>();
export function noteTranscriptOnce(sid: string, file: string): void {
  if (read.has(sid) || titles.has(sid)) return;
  read.add(sid);
  void noteTranscript(file).catch(() => undefined);
}

/** At start: the chats changed in the last 14 days. */
export async function noteRecentTranscripts(): Promise<void> {
  for (const s of queueDb.listClaudeSessions(14)) {
    if (s.jsonl_path) await noteTranscript(s.jsonl_path).catch(() => undefined); // a transcript removed since
  }
}
