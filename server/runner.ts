#!/usr/bin/env node
// quests: the runner. It owns the Claude (and Codex, Cursor, OpenCode) processes of chats, so a restart of the
// page server (quests-ui.service) never stops a turn, a subagent or a background command. It listens on a Unix
// socket only the user can open; the page server passes the page's chat and notification sockets through to it
// and reads GET /state (server/shared/runtime-state.ts).
//
// Two modes:
// - QUESTS_CHAT=<page session id>: a chat service, the user unit quests-chat-<id> that the manager
//   (server/modules/chat-hosts) starts. It runs that one chat, keeps its own record in the chat_hosts table, tells
//   the manager at once when its state changes (the /control socket), and exits after 2 minutes with nothing
//   running, so the chat's next message starts it on the newest build. SIGTERM (a deliberate stop or a shutdown)
//   exits at once and leaves the record open, so the manager wakes the chat when it comes back.
// - Without it: the old single runner (quests-runner.service), until its last chat has ended. It restarts only
//   through a drain: on SIGTERM it refuses new turns, waits until no turn runs and no Claude process is held for
//   background work, then exits. A second SIGTERM, or a machine that is shutting down, ends it at once.
import './load-env.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';

import { authenticateWebSocket } from '@/modules/auth/index.js';
import { chatHostsDb, initializeDatabase } from '@/modules/database/index.js';
import { configureWebPush, handleDesktopNotificationsConnection } from '@/modules/notifications/index.js';
import {
  listClaudeSDKLastSteps,
  listClaudeSDKSessionStartTimes,
  listClaudeSDKTurnsInFlight,
  providerRuntimeService,
} from '@/modules/providers/index.js';
import { CHATS_DIR, RUNNER_SOCKET, chatSocket, chatUnit, type RuntimeState } from '@/shared/runtime-state.js';
import { initializeScheduledMessageDispatcher } from '@/modules/scheduled-messages/index.js';
import { chatRunRegistry, type ProviderRuntimeGateway } from '@/modules/websocket/index.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';
import { verifyWebSocketClient } from '@/modules/websocket/services/websocket-auth.service.js';
import { attachWebSocketHeartbeat } from '@/modules/websocket/services/websocket-server.service.js';
import type { AuthenticatedWebSocketRequest } from '@/shared/types.js';
import { IS_PLATFORM } from '@/shared/utils.js';

const CHAT = process.env.QUESTS_CHAT || null;
const IDLE_EXIT_MS = Number(process.env.QUESTS_IDLE_EXIT_MS ?? 120_000);
let draining = false;

/** The runtime, except that a drain refuses new turns: a turn started now would hold the restart back. */
const runtime: ProviderRuntimeGateway = {
  ...providerRuntimeService,
  run: (provider, command, options, writer) => (draining
    ? Promise.reject(new Error('The chat runner is restarting for an update. Send the message again in a minute.'))
    : providerRuntimeService.run(provider, command, options, writer)),
};

function runtimeState(): RuntimeState {
  const runs = chatRunRegistry.listRuns();
  return {
    runs,
    approvals: Object.fromEntries(runs.map((r) => [r.sessionId, providerRuntimeService.getPendingApprovalsForSession(r.sessionId)]).filter(([, a]) => (a as unknown[]).length > 0)),
    inFlight: listClaudeSDKTurnsInFlight(),
    lastSteps: listClaudeSDKLastSteps(),
    background: providerRuntimeService.listBackgroundWork(),
    startTimes: listClaudeSDKSessionStartTimes() as Record<string, number>,
  };
}

/** What still holds a drain: running turns and live Claude processes (held for background work). */
function holders(): string[] {
  const running = chatRunRegistry.listRunningRuns().map((r) => `turn ${r.sessionId}`);
  const held = Object.keys(listClaudeSDKSessionStartTimes() as Record<string, number>).map((id) => `process ${id}`);
  return [...running, ...held];
}

function machineStopping(): boolean {
  try {
    return execFileSync('systemctl', ['--user', 'is-system-running'], { encoding: 'utf8' }).trim() === 'stopping';
  } catch (error) {
    // is-system-running exits non-zero for every state but "running", and still prints the state.
    return String((error as { stdout?: string }).stdout ?? '').trim() === 'stopping';
  }
}

function drain(): void {
  if (draining || machineStopping()) {
    console.log('[runner] stopping now');
    process.exit(0);
  }
  draining = true;
  console.log('[runner] drain: no new turns; waiting for the running work to end');
  let lastLog = 0;
  const check = () => {
    const held = holders();
    if (held.length === 0) {
      console.log('[runner] drain done');
      process.exit(0);
    }
    if (Date.now() - lastLog > 60_000) {
      lastLog = Date.now();
      console.log(`[runner] drain waits for: ${held.join(', ')}`);
    }
  };
  setInterval(check, 2000);
  check();
}

/**
 * Chat service: keeps the chat's record (turn open, process held, last event) and tells the manager's /control
 * sockets at once when the state the queue shows changes. Read every 250 ms in memory, which costs nothing.
 */
function watchChat(sessionId: string, control: Set<WebSocket>): void {
  let signature = '';
  let turn = false;
  let held = false;
  let lastStep = '';
  let lastTouch = 0;
  let idleSince = Date.now();
  setInterval(() => {
    const s = runtimeState();
    const running = s.runs.some((r) => r.status === 'running');
    const live = Object.keys(s.startTimes).length > 0;
    const approvals = Object.values(s.approvals).flat().length;
    const next = JSON.stringify([running, live, approvals, s.inFlight.length, s.background.map((b) => b.tasks.length)]);
    if (next !== signature) {
      signature = next;
      for (const ws of control) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ kind: 'quests_state_changed', sessionId }));
    }
    if (running !== turn) { turn = running; chatHostsDb.setTurn(sessionId, running); }
    if (live !== held) { held = live; chatHostsDb.setHeld(sessionId, live); }
    const step = JSON.stringify(Object.values(s.lastSteps));
    if (step !== lastStep && Date.now() - lastTouch > 10_000) { lastStep = step; lastTouch = Date.now(); chatHostsDb.touch(sessionId); }
    if (running || live || approvals > 0) idleSince = Date.now();
    else if (Date.now() - idleSince > IDLE_EXIT_MS) {
      console.log(`[chat ${sessionId}] idle; exiting so the next message starts the newest build`);
      chatHostsDb.end(sessionId);
      process.exit(0);
    }
  }, 250);
}

async function start(): Promise<void> {
  await initializeDatabase();
  configureWebPush();
  // A completed run stays subscribable while its session's background work is still reporting through it.
  chatRunRegistry.setRetentionGuard((sessionId) => providerRuntimeService.hasBackgroundWork(sessionId));

  const control = new Set<WebSocket>();
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(runtimeState()));
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({
    server,
    verifyClient: (info: Parameters<typeof verifyWebSocketClient>[0]) => verifyWebSocketClient(info, { isPlatform: IS_PLATFORM, authenticateWebSocket }),
  });
  wss.on('connection', (ws, request) => {
    attachWebSocketHeartbeat(ws);
    const req = request as AuthenticatedWebSocketRequest;
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/ws') handleChatConnection(ws, req, { runtime });
    else if (pathname === '/desktop-notifications') handleDesktopNotificationsConnection(ws, req);
    else if (pathname === '/control') {
      control.add(ws);
      ws.on('close', () => control.delete(ws));
    } else ws.close();
  });

  const socket = CHAT ? chatSocket(CHAT) : RUNNER_SOCKET;
  fs.mkdirSync(CHATS_DIR, { recursive: true, mode: 0o700 });
  fs.rmSync(socket, { force: true });
  server.listen(socket, () => {
    fs.chmodSync(socket, 0o600);
    console.log(`[runner] listening on ${socket}`);
    if (CHAT) {
      chatHostsDb.register(CHAT, chatUnit(CHAT), process.env.QUESTS_BUILD ?? 'dev', process.pid);
      watchChat(CHAT, control);
    } else {
      // Sends anything that came due while no runner ran, then keeps polling.
      initializeScheduledMessageDispatcher(runtime);
    }
  });

  process.on('SIGTERM', CHAT ? () => process.exit(0) : drain);
  process.on('SIGINT', () => process.exit(0));
}

void start();
