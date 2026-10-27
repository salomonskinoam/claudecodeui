import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';

import { queueDb } from '@/modules/database/index.js';

/**
 * quests priority queue: what the queue is built from, kept in memory.
 *   tickets      the open GitHub issues of salomonskinoam/tickets, every 15 seconds (one paged GraphQL call)
 *   live         Claude Code's registry ~/.claude/sessions/*.json, every 2 seconds
 *   cursorTabs   the chats open as tabs in Cursor, every 2 seconds
 *   closing lines, written to queue_chats on every transcript change and at start
 */

export const TICKETS_REPO = 'salomonskinoam/tickets';
export const run = promisify(execFile);

const SID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const CLAIM = /Claimed by chat (.+?), session ([0-9a-f-]{36})/g;
const CLOSING = /^(waiting for|question|blocker|done)\b[ :]*(.+)$/i;
const FINALIZE = '<command-name>/finalize-chat</command-name>';

export type Ticket = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  labels: string[];
  parent: { number: number; state: string } | null;
  /** Claims in comment order, the newest last. */
  claims: Array<{ name: string; sid: string }>;
  /** Session ids in the "## Blocks" section. */
  blocksSids: string[];
  /** The session id in the "## Parent chat" section. */
  parentChatSid: string | null;
};

export type LiveProcess = {
  sessionId: string;
  status: 'busy' | 'waiting' | 'idle';
  waitingFor: string | null;
  entrypoint: string | null;
  name: string | null;
  statusUpdatedAt: number;
};

let tickets: Ticket[] = [];
let live = new Map<string, LiveProcess>();
let cursorTabs = new Set<string>();

export const getTickets = () => tickets;
export const getLive = () => live;
export const getCursorTabs = () => cursorTabs;

const section = (body: string, name: string): string =>
  body.match(new RegExp(`## ${name}([\\s\\S]*?)(\\n## |$)`))?.[1] ?? '';

const TICKETS_QUERY = `query($cursor: String) { repository(owner: "salomonskinoam", name: "tickets") {
  issues(states: OPEN, first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes {
    number title url body createdAt labels(first: 20) { nodes { name } } parent { number state }
    comments(last: 50) { nodes { body } } } } } }`;

type IssueNode = {
  number: number; title: string; url: string; body: string; createdAt: string;
  labels: { nodes: Array<{ name: string }> }; parent: { number: number; state: string } | null;
  comments: { nodes: Array<{ body: string }> };
};

export async function refreshTickets(): Promise<void> {
  const nodes: IssueNode[] = [];
  let cursor: string | null = null;
  do {
    const args: string[] = ['api', 'graphql', '-f', `query=${TICKETS_QUERY}`, ...(cursor ? ['-f', `cursor=${cursor}`] : [])];
    const { stdout } = await run('gh', args, { maxBuffer: 64 * 1024 * 1024 });
    const page = JSON.parse(stdout).data.repository.issues;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  tickets = nodes.map((n) => ({
    number: n.number,
    title: n.title,
    url: n.url,
    createdAt: n.createdAt,
    labels: n.labels.nodes.map((l) => l.name),
    parent: n.parent,
    claims: n.comments.nodes.flatMap((c) => [...c.body.matchAll(CLAIM)].map((m) => ({ name: m[1], sid: m[2] }))),
    blocksSids: [...section(n.body, 'Blocks').matchAll(SID)].map((m) => m[0]),
    parentChatSid: section(n.body, 'Parent chat').match(SID)?.[0] ?? null,
  }));
}

const STATUS_RANK = { busy: 2, waiting: 1, idle: 0 } as const;

/** Live processes; when one chat has two, the strongest state wins (busy over waiting over idle). */
export async function refreshLive(): Promise<void> {
  const dir = path.join(os.homedir(), '.claude', 'sessions');
  const next = new Map<string, LiveProcess>();
  for (const file of await fs.readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    let entry;
    try {
      entry = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
      process.kill(entry.pid, 0);
    } catch {
      continue; // the process exited, or is rewriting its file right now
    }
    if (!entry.sessionId || !(entry.status in STATUS_RANK)) continue;
    const p: LiveProcess = {
      sessionId: entry.sessionId,
      status: entry.status,
      waitingFor: entry.waitingFor ?? null,
      entrypoint: entry.entrypoint ?? null,
      name: entry.name ?? null,
      statusUpdatedAt: entry.statusUpdatedAt ?? entry.updatedAt ?? 0,
    };
    const had = next.get(p.sessionId);
    if (!had || STATUS_RANK[p.status] > STATUS_RANK[had.status]) next.set(p.sessionId, p);
  }
  live = next;
}

/** Session ids open as Claude tabs in Cursor, from Cursor's saved workspace state. */
export async function refreshCursorTabs(): Promise<void> {
  const base = path.join(os.homedir(), '.config', 'Cursor', 'User', 'workspaceStorage');
  const week = Date.now() - 7 * 24 * 3600 * 1000;
  const next = new Set<string>();
  for (const dir of await fs.readdir(base)) {
    const file = path.join(base, dir, 'state.vscdb');
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.mtimeMs < week) continue;
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'Anthropic.claude-code'").get() as { value: string | Buffer } | undefined;
      const tabs = row ? JSON.parse(String(row.value)).panelTabSessions ?? [] : [];
      for (const t of tabs) if (t.sessionId) next.add(t.sessionId);
    } finally {
      db.close();
    }
  }
  cursorTabs = next;
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

/** A user turn that ran /finalize-chat (the text alone also appears in replies that talk about it). */
function isFinalizeCommand(line: string): boolean {
  if (!line.includes(FINALIZE) || !line.includes('"type":"user"')) return false;
  try {
    const row = JSON.parse(line);
    return row.type === 'user' && typeof row.message?.content === 'string' && row.message.content.includes(FINALIZE);
  } catch {
    return false;
  }
}

/** Read a chat's last closing line from its transcript and store it. */
export async function noteTranscript(file: string): Promise<void> {
  if (!file.endsWith('.jsonl') || file.includes(`${path.sep}subagents${path.sep}`)) return;
  const sid = path.basename(file, '.jsonl');
  // A /finalize-chat run writes a lot (merges, audits): the command can sit hundreds of KB before the end
  // (371 KB on 2026-10-14's "oct_12 Argus and rubrics before delivery"), so read 8 MB back.
  const lines = await readTail(file, 8 * 1024 * 1024);
  let kind: string | null = null;
  let text: string | null = null;
  let at: string | null = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('"type":"assistant"')) continue;
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue; // a line being written right now
    }
    if (row.type !== 'assistant' || row.isSidechain) continue;
    const said = (row.message?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n');
    if (!said.trim()) continue;
    const last = said.split('\n').map((l: string) => l.trim()).filter(Boolean).pop() ?? '';
    const m = last.match(CLOSING);
    if (m) {
      kind = m[1].toLowerCase();
      text = m[2];
    }
    at = row.timestamp ?? null;
    break;
  }
  queueDb.setChat({
    provider_session_id: sid,
    line_kind: kind,
    line_text: text,
    line_at: at,
    finalized: lines.some(isFinalizeCommand) ? 1 : 0,
  });
}

/** At start: the closing lines of the chats changed in the last 14 days. */
export async function noteRecentTranscripts(): Promise<void> {
  for (const s of queueDb.listClaudeSessions(14)) {
    if (s.jsonl_path) await noteTranscript(s.jsonl_path).catch(() => undefined); // a transcript removed since
  }
}
