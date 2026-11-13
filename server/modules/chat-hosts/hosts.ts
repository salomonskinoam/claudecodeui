import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { WebSocket } from 'ws';

import { generateToken } from '@/modules/auth/index.js';
import { userDb } from '@/modules/database/index.js';
import { connectedClients } from '@/modules/websocket/index.js';
import { chatSocket, chatUnit, refreshRuntimeState } from '@/shared/runtime-state.js';
import { findApplicationRoot, getModuleDirectory } from '@/shared/utils.js';

/**
 * quests: the manager's side of the chat services. Each chat runs in its own user unit, quests-chat-<page session
 * id> (server/runner.ts with QUESTS_CHAT), started here with systemd-run from scripts/start-chat.sh. systemd refuses
 * a second unit of the same name, so a chat never has two processes. The page server holds no work: it starts
 * services, passes frames to them, and reads their state.
 */

const run = promisify(execFile);
const START_SCRIPT = path.join(findApplicationRoot(getModuleDirectory(import.meta.url)), 'scripts', 'start-chat.sh');

/** True when something listens on the socket (a crashed service leaves its file behind). */
export function socketAnswers(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!fs.existsSync(socket)) return resolve(false);
    const c = net.connect(socket);
    c.once('connect', () => { c.destroy(); resolve(true); });
    c.once('error', () => resolve(false));
  });
}

export async function unitActive(sessionId: string): Promise<boolean> {
  const { stdout } = await run('systemctl', ['--user', 'is-active', `${chatUnit(sessionId)}.service`]).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? '' }));
  return ['active', 'activating', 'deactivating'].includes(stdout.trim());
}

const starting = new Map<string, Promise<void>>();
const startListeners = new Set<(sessionId: string) => void>();
/** Called after a chat service started (the router subscribes the browsers that show that chat). */
export const onHostStarted = (f: (sessionId: string) => void): void => { startListeners.add(f); };

/** Starts the chat's service unless it runs; resolves once its socket answers. */
export function ensureHost(sessionId: string): Promise<void> {
  const pending = starting.get(sessionId);
  if (pending) return pending;
  const p = (async () => {
    if (await socketAnswers(chatSocket(sessionId))) return;
    if (!(await unitActive(sessionId))) {
      await run('systemd-run', ['--user', '--collect', '--unit', chatUnit(sessionId), `--description=quests chat ${sessionId}`, `--setenv=QUESTS_INSTANCE=${process.env.QUESTS_INSTANCE}`, START_SCRIPT, sessionId]);
    }
    for (let i = 0; i < 300; i += 1) {
      if (await socketAnswers(chatSocket(sessionId))) {
        void refreshRuntimeState();
        for (const f of startListeners) f(sessionId);
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`chat service ${chatUnit(sessionId)} did not open its socket in 30 s`);
  })().finally(() => starting.delete(sessionId));
  starting.set(sessionId, p);
  return p;
}

/** The manager's own token for its connections to chat services (the services check it like a browser's). */
function systemToken(): string {
  const user = userDb.getFirstUser();
  if (!user) throw new Error('no user to sign the manager token for');
  return generateToken(user) as string;
}

/**
 * Sends a message to a chat as Noam would from the composer, starting its service when needed: the wake after a
 * crash, a listener's result, a scheduled message. The connection stays open while the turn runs, then closes.
 */
export async function sendToChat(sessionId: string, content: string, options: Record<string, unknown> = { permissionMode: 'auto' }): Promise<void> {
  await ensureHost(sessionId);
  const ws = new WebSocket(`ws+unix:${chatSocket(sessionId)}:/ws?token=${systemToken()}`);
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.on('message', (data) => {
    const text = String(data);
    if (text.includes('"session_upserted"')) fanOutUpsert(text);
    const e = JSON.parse(text) as { kind?: string };
    if (e.kind === 'complete' || e.kind === 'protocol_error') ws.close();
  });
  ws.send(JSON.stringify({ type: 'chat.send', sessionId, content, options }));
  // The browsers showing this chat subscribe to the run this message starts.
  for (const f of startListeners) f(sessionId);
}

const recentUpserts = new Map<string, number>();
/**
 * A chat's provider id landed (`session_upserted`): every browser's sidebar needs it. Each upstream to that chat's
 * service receives the same frame, so a frame seen in the last 2 s is sent only once.
 */
export function fanOutUpsert(text: string): void {
  const now = Date.now();
  for (const [t, at] of recentUpserts) if (now - at > 2000) recentUpserts.delete(t);
  if (recentUpserts.has(text)) return;
  recentUpserts.set(text, now);
  for (const c of connectedClients) if (c.readyState === WebSocket.OPEN) c.send(text);
}

/** A connection to a chat service's /control socket, which says at once when its state changed. */
export function controlConnection(sessionId: string, onChange: () => void): WebSocket {
  const ws = new WebSocket(`ws+unix:${chatSocket(sessionId)}:/control?token=${systemToken()}`);
  ws.on('message', onChange);
  ws.on('error', () => undefined);
  return ws;
}
