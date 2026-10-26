#!/usr/bin/env node
// quests priority queue: name a chat "<mm_dd> <world> <word> <word>" (plus " #<ticket>"), the one name format.
//   node rename_chat.mjs <session id> "<name>"
//   node rename_chat.mjs <session id> --haiku "<text>" [--ticket <n>]   Claude Haiku picks the world and the two words
// The name is written with the Agent SDK's renameSession: the same custom-title line a rename in Cursor writes.
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { query, renameSession } from '../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs';

export const NAME_FORMAT = /^\d\d_\d\d \S+ \S+ \S+( #\d+)?$/;

export function today() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
}

export async function haikuName(text, ticket) {
  const cwd = path.join(os.homedir(), '.cache', 'quests-haiku');
  mkdirSync(cwd, { recursive: true });
  const prompt = 'Name a work chat from its first message or ticket title. Answer with exactly one line '
    + '"<world>|<word> <word>": world is one lowercase word (the project or area), then a two-word objective, '
    + `lowercase, no punctuation.\n\nText: ${text}`;
  let answer = '';
  for await (const m of query({ prompt, options: { model: 'claude-haiku-5-5', maxTurns: 1, tools: [], settingSources: [], persistSession: false, cwd } })) {
    if (m.type === 'result') answer = m.result.trim();
  }
  // Each call leaves a small title file under ~/.claude/projects/<cwd with / as ->; it is not a chat.
  rmSync(path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-')), { recursive: true, force: true });
  const m = answer.match(/^(\S+)\|(\S+) (\S+)$/);
  if (!m) throw new Error(`Haiku did not answer "<world>|<word> <word>": ${answer}`);
  return `${today()} ${m[1]} ${m[2]} ${m[3]}${ticket ? ` #${ticket}` : ''}`;
}

export async function renameChat(sessionId, name) {
  if (!NAME_FORMAT.test(name)) throw new Error(`"${name}" is not "<mm_dd> <world> <word> <word>" with an optional " #<ticket>"`);
  await renameSession(sessionId, name);
  return name;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [sessionId, ...rest] = process.argv.slice(2);
  const flag = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  const name = rest[0] === '--haiku' ? await haikuName(flag('--haiku'), flag('--ticket')) : rest[0];
  console.log(await renameChat(sessionId, name));
}
