#!/usr/bin/env node
// quests: the runner. It owns the Claude (and Codex, Cursor, OpenCode) processes of the chats the page runs, so a
// restart of the page server (quests-ui.service) never stops a turn, a subagent or a background command. It
// listens on a Unix socket only the user can open; the page server passes the page's chat and notification
// sockets through to it and reads GET /state (server/modules/runner/runtime-state.ts).
//
// It restarts only through a drain: on SIGTERM (systemctl --user restart quests-runner) it refuses new turns,
// waits until no turn runs and no Claude process is held for background work, then exits, and systemd starts the
// new code. A second SIGTERM, or a machine that is shutting down, ends it at once.
import './load-env.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

import { WebSocketServer } from 'ws';

import { authenticateWebSocket } from '@/modules/auth/index.js';
import { initializeDatabase } from '@/modules/database/index.js';
import { configureWebPush, handleDesktopNotificationsConnection } from '@/modules/notifications/index.js';
import {
  listClaudeSDKLastSteps,
  listClaudeSDKSessionStartTimes,
  listClaudeSDKTurnsInFlight,
  providerRuntimeService,
} from '@/modules/providers/index.js';
import { RUNNER_SOCKET, type RuntimeState } from '@/shared/runtime-state.js';
import { initializeScheduledMessageDispatcher } from '@/modules/scheduled-messages/index.js';
import { chatRunRegistry, type ProviderRuntimeGateway } from '@/modules/websocket/index.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';
import { verifyWebSocketClient } from '@/modules/websocket/services/websocket-auth.service.js';
import { attachWebSocketHeartbeat } from '@/modules/websocket/services/websocket-server.service.js';
import type { AuthenticatedWebSocketRequest } from '@/shared/types.js';
import { IS_PLATFORM } from '@/shared/utils.js';

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

async function start(): Promise<void> {
  await initializeDatabase();
  configureWebPush();
  // A completed run stays subscribable while its session's background work is still reporting through it.
  chatRunRegistry.setRetentionGuard((sessionId) => providerRuntimeService.hasBackgroundWork(sessionId));

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
    else ws.close();
  });

  fs.rmSync(RUNNER_SOCKET, { force: true });
  server.listen(RUNNER_SOCKET, () => {
    fs.chmodSync(RUNNER_SOCKET, 0o600);
    console.log(`[runner] listening on ${RUNNER_SOCKET}`);
    // Sends anything that came due while no runner ran, then keeps polling.
    initializeScheduledMessageDispatcher(runtime);
  });

  process.on('SIGTERM', drain);
  process.on('SIGINT', () => process.exit(0));
}

void start();
