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

/** A user turn that ran /finalize-chat (the text alone also appears in replies that talk about it). */
const isFinalizeCommand = (line: string): boolean => {
  if (!line.includes(FINALIZE) || !line.includes('"type":"user"')) return false;
  const row = parse(line);
  return row?.type === 'user' && typeof row.message?.content === 'string' && row.message.content.includes(FINALIZE);
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
