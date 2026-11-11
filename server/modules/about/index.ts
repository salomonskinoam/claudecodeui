import { randomUUID } from 'node:crypto';

import { query } from '@anthropic-ai/claude-agent-sdk';
import express from 'express';
import type { Request, Response } from 'express';

import { getConnection, sessionsDb } from '@/modules/database/index.js';
import { resolveClaudeCodeExecutablePath } from '@/shared/claude-cli-path.js';
import { AppError, asyncHandler, createApiSuccessResponse } from '@/shared/utils.js';

/**
 * quests (requirement 117): the About section of the Summary drawer, a side chat like /btw. Noam's first message
 * copies the chat's conversation into a new Claude session (fork) that answers it with no tools; his next messages
 * continue that copy, so he can sharpen the answer. The chat itself never sees it. "New" starts a fresh copy.
 * Noam, 11 Nov: "it should only create that summary when clicked ... with a premade prompt that would run in the
 * background as a /btw. the result would remain static until the next time." and "i would like to have it as a
 * chat in case i need to sharpen something though. like btw".
 */

type Turn = { role: 'user' | 'assistant'; text: string; at: string };
type Row = { side_session_id: string; session_id: string; turns: string };
// While it answers: the seconds since Send, and the thinking and text streamed so far (Noam, 11 Nov: "it took a
// while with no liveness indication").
type Live = { startedAt: number; thinking: string; text: string };
export type About = { turns: Turn[]; busy: boolean; error: string | null; seconds: number | null; thinking: string; text: string };

const SIDE = 'This message is a side question asked from the quests page about this conversation. You have no tools: '
  + 'answer in words only, from what the conversation holds. Write no Summary, no "Running" line, no "Required from '
  + 'you" line and no queue closing line.';

const busy = new Map<string, Live>();
const errors = new Map<string, string>();

const current = (sessionId: string) => getConnection()
  .prepare('SELECT * FROM about_chats WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
  .get(sessionId) as Row | undefined;

const save = (sideId: string, turns: Turn[]) => getConnection()
  .prepare('UPDATE about_chats SET turns = ? WHERE side_session_id = ?').run(JSON.stringify(turns), sideId);

/** A side chat's transcript is not a chat: the session indexer skips it, so it shows in no list and no queue. */
export function isSideChat(providerSessionId: string): boolean {
  return Boolean(getConnection().prepare('SELECT 1 FROM about_chats WHERE side_session_id = ?').get(providerSessionId));
}

export function getAbout(sessionId: string): About {
  const row = current(sessionId);
  const live = busy.get(sessionId);
  return {
    turns: row ? JSON.parse(row.turns) as Turn[] : [],
    busy: Boolean(live),
    error: errors.get(sessionId) ?? null,
    seconds: live ? Math.round((Date.now() - live.startedAt) / 1000) : null,
    thinking: live?.thinking ?? '',
    text: live?.text ?? '',
  };
}

async function run(sessionId: string, text: string, fresh: boolean, live: Live): Promise<void> {
  const chat = sessionsDb.getSessionById(sessionId);
  if (!chat?.provider_session_id || !chat.project_path || chat.provider !== 'claude') {
    throw new Error('This chat has no Claude transcript to copy yet.');
  }
  const old = fresh ? undefined : current(sessionId);
  const sideId = old?.side_session_id ?? randomUUID();
  // The row exists before the copy is written, so the indexer skips the copy from its first line.
  if (!old) {
    getConnection().prepare('INSERT INTO about_chats (side_session_id, session_id, created_at) VALUES (?, ?, ?)')
      .run(sideId, sessionId, new Date().toISOString());
  }
  const turns: Turn[] = old ? JSON.parse(old.turns) as Turn[] : [];
  turns.push({ role: 'user', text, at: new Date().toISOString() });
  save(sideId, turns);

  const executable = resolveClaudeCodeExecutablePath(process.env.CLAUDE_CLI_PATH);
  let answer = '';
  for await (const m of query({
    prompt: text,
    options: {
      cwd: chat.project_path,
      env: { ...process.env },
      ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
      ...(chat.model ? { model: chat.model } : {}),
      // No tools and no MCP servers (the claude.ai connectors join otherwise): it answers in words only.
      tools: [],
      strictMcpConfig: true,
      mcpServers: {},
      // No settings: no hooks, so the queue's stop hook asks this copy for nothing.
      settingSources: [],
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: SIDE },
      ...(old ? { resume: sideId } : { resume: chat.provider_session_id, forkSession: true, sessionId: sideId }),
    },
  })) {
    if (m.type === 'stream_event' && m.event.type === 'content_block_delta') {
      if (m.event.delta.type === 'thinking_delta') live.thinking += m.event.delta.thinking;
      if (m.event.delta.type === 'text_delta') live.text += m.event.delta.text;
    }
    if (m.type === 'result') {
      if (m.subtype !== 'success') throw new Error(`The side chat ended with ${m.subtype}.`);
      answer = m.result;
    }
  }
  turns.push({ role: 'assistant', text: answer, at: new Date().toISOString() });
  save(sideId, turns);
}

/** Starts an answer in the background; the page reads the state until `busy` is false. */
export function ask(sessionId: string, text: string, fresh: boolean): About {
  if (busy.has(sessionId)) throw new AppError('The side chat is still answering.', { code: 'BUSY', statusCode: 409 });
  const live: Live = { startedAt: Date.now(), thinking: '', text: '' };
  busy.set(sessionId, live);
  errors.delete(sessionId);
  run(sessionId, text, fresh, live)
    .catch((error: unknown) => errors.set(sessionId, error instanceof Error ? error.message : String(error)))
    .finally(() => busy.delete(sessionId));
  return getAbout(sessionId);
}

const router = express.Router();

router.get('/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  res.json(createApiSuccessResponse(getAbout(String(req.params.sessionId))));
}));

router.post('/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) throw new AppError('The message is empty.', { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
  res.json(createApiSuccessResponse(ask(String(req.params.sessionId), text, req.body?.fresh === true)));
}));

export const aboutRoutes = router;
