#!/usr/bin/env node
// quests priority queue: name a chat "<mon_dd> <area> <word> <word>" (plus " #<ticket>"), the one name format. The area
// is one of the repo's areas: the "areas" command of <repo>/quests.json prints them (quests/INTERFACE.md).
//   node rename_chat.mjs <session id> "<name>"
//   node rename_chat.mjs <session id> --haiku "<text>" [--ticket <n>]   Claude Haiku picks the area and the two words
// Run it from the chat's folder (or with CLAUDE_PROJECT_DIR set): that is the repo whose areas count.
// The name is written with the Agent SDK's renameSession: the same custom-title line a rename in Cursor writes.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { query, renameSession } from '../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';

export const NAME_FORMAT = /^[a-z]{3}_\d\d \S+ \S+ \S+( #\d+)?$/;

/** The repo's areas, from its quests.json "areas" command, run at the repo root. */
export function areasOf(repo = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()) {
  const root = repo.replace(/\/\.claude\/worktrees\/[^/]+$/, '');
  const { areas } = JSON.parse(readFileSync(path.join(root, 'quests.json'), 'utf8'));
  return execSync(areas, { cwd: root, encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
}

export function today() {
  const d = new Date();
  return `${d.toLocaleString("en", { month: "short" }).toLowerCase()}_${String(d.getDate()).padStart(2, '0')}`;
}

export async function haikuName(text, ticket, areas = areasOf()) {
  const cwd = path.join(os.homedir(), '.cache', 'quests-haiku');
  mkdirSync(cwd, { recursive: true });
  const prompt = 'Name a work chat from its first message or ticket title. Answer with exactly one line '
    + `"<area>|<word> <word>": area is exactly one of: ${areas.join(', ')}; then a two-word objective, `
    + `lowercase, no punctuation.\n\nText: ${text}`;
  let answer = '';
  for await (const m of query({ prompt, options: { model: 'claude-haiku-5-5', maxTurns: 1, tools: [], settingSources: [], persistSession: false, cwd } })) {
    if (m.type === 'result') answer = m.result.trim();
  }
  // Each call leaves a small title file under ~/.claude/projects/<cwd with / as ->; it is not a chat.
  rmSync(path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')), { recursive: true, force: true });
  const m = answer.match(/^(\S+)\|(\S+) (\S+)$/);
  if (!m || !areas.includes(m[1])) throw new Error(`Haiku did not answer "<area>|<word> <word>" with an area of ${areas.join(', ')}: ${answer}`);
  return `${today()} ${m[1]} ${m[2]} ${m[3]}${ticket ? ` #${ticket}` : ''}`;
}

export async function renameChat(sessionId, name, areas = areasOf()) {
  if (!NAME_FORMAT.test(name)) throw new Error(`"${name}" is not "<mon_dd> <area> <word> <word>" with an optional " #<ticket>"`);
  const area = name.split(' ')[1];
  if (!areas.includes(area)) throw new Error(`"${area}" is not one of this repo's areas: ${areas.join(', ')}`);
  await renameSession(sessionId, name);
  return name;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [sessionId, ...rest] = process.argv.slice(2);
  const flag = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  const name = rest[0] === '--haiku' ? await haikuName(flag('--haiku'), flag('--ticket')) : rest[0];
  console.log(await renameChat(sessionId, name));
}
