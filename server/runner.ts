#!/usr/bin/env node
// quests: one chat's service, the user unit quests-chat-<page session id> that the manager
// (server/modules/chat-hosts) starts with scripts/start-chat.sh. It owns that chat's Claude (or Codex, Cursor,
// OpenCode) process, so a restart of the page server (quests-ui.service) never stops a turn, a subagent or a
// background command. It listens on its own Unix socket, which only the user can open; the manager passes the
// browser's frames for this chat to it, reads GET /state, and hears at once on /control when the state changes.
//
// It keeps its own record in the chat_hosts table, sends this chat's scheduled and queued messages, and exits after
// 2 minutes with nothing running, so the chat's next message starts it on the newest build. SIGTERM (a deliberate
// stop or a shutdown) exits at once and leaves the record open, so the manager wakes the chat when it comes back.
import './load-env.js';
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
import { CHATS_DIR, chatSocket, chatUnit, type RuntimeState } from '@/shared/runtime-state.js';
import { initializeScheduledMessageDispatcher } from '@/modules/scheduled-messages/index.js';
import { chatRunRegistry } from '@/modules/websocket/index.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';
import { verifyWebSocketClient } from '@/modules/websocket/services/websocket-auth.service.js';
import { attachWebSocketHeartbeat } from '@/modules/websocket/services/websocket-server.service.js';
import type { AuthenticatedWebSocketRequest } from '@/shared/types.js';
import { IS_PLATFORM } from '@/shared/utils.js';

const CHAT: string = process.env.QUESTS_CHAT ?? '';
if (!CHAT) throw new Error('QUESTS_CHAT (the page session id of the chat to run) is required');
const IDLE_EXIT_MS = Number(process.env.QUESTS_IDLE_EXIT_MS ?? 120_000);

function runtimeState(): RuntimeState {
  const approvals = providerRuntimeService.getPendingApprovalsForSession(CHAT);
  return {
    runs: chatRunRegistry.listRuns(),
    approvals: approvals.length > 0 ? { [CHAT]: approvals } : {},
    inFlight: listClaudeSDKTurnsInFlight(),
    lastSteps: listClaudeSDKLastSteps(),
    background: providerRuntimeService.listBackgroundWork(),
    startTimes: listClaudeSDKSessionStartTimes() as Record<string, number>,
  };
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
    if (pathname === '/ws') handleChatConnection(ws, req, { runtime: providerRuntimeService });
    else if (pathname === '/desktop-notifications') handleDesktopNotificationsConnection(ws, req);
    else if (pathname === '/control') {
      control.add(ws);
      ws.on('close', () => control.delete(ws));
    } else ws.close();
  });

  const socket = chatSocket(CHAT);
  fs.mkdirSync(CHATS_DIR, { recursive: true, mode: 0o700 });
  fs.rmSync(socket, { force: true });
  server.listen(socket, () => {
    fs.chmodSync(socket, 0o600);
    console.log(`[chat ${CHAT}] listening on ${socket}`);
    chatHostsDb.register(CHAT, chatUnit(CHAT), process.env.QUESTS_BUILD ?? 'dev', process.pid);
    watchChat(CHAT, control);
    // Sends this chat's messages that came due while it had no service, then keeps polling.
    initializeScheduledMessageDispatcher(providerRuntimeService, CHAT);
  });

  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

void start();
