import { WebSocket } from 'ws';

import { RUNNER_SOCKET, refreshRuntimeState } from '@/shared/runtime-state.js';
import { connectedClients } from '@/modules/websocket/index.js';
import type { AuthenticatedWebSocketRequest } from '@/shared/types.js';

/**
 * quests: the page server passes a browser's chat socket (`/ws`) and notification socket
 * (`/desktop-notifications`) through to the runner, frame for frame, both ways. The runner checks the token in
 * the URL itself. When either side closes, the other closes too: the page reconnects and subscribes again with
 * its run id and sequence number, and the runner replays what it missed.
 *
 * The browser's chat socket also stays in this server's `connectedClients`, so what this server broadcasts
 * (sessions it indexed from disk) still reaches the page.
 */
export function proxyToRunner(browser: WebSocket, request: AuthenticatedWebSocketRequest, chat: boolean): void {
  const runner = new WebSocket(`ws+unix:${RUNNER_SOCKET}:${request.url ?? '/'}`);
  const pending: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];
  if (chat) connectedClients.add(browser);

  browser.on('message', (data, isBinary) => {
    if (runner.readyState === WebSocket.OPEN) runner.send(data, { binary: isBinary });
    else pending.push({ data, isBinary });
    // A send or a stop changes what runs: the queue and the dots read the runner's state again at once.
    if (chat && !isBinary) {
      const type = /"type"\s*:\s*"([^"]+)"/.exec(data.toString().slice(0, 200))?.[1];
      if (type === 'chat.send' || type === 'chat.edit-send' || type === 'chat.abort') setTimeout(() => void refreshRuntimeState(), 300);
    }
  });
  runner.on('open', () => {
    for (const { data, isBinary } of pending.splice(0)) runner.send(data, { binary: isBinary });
  });
  runner.on('message', (data, isBinary) => {
    if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary: isBinary });
    const text = chat && !isBinary ? data.toString() : '';
    if (text.length < 4000 && text.includes('"kind":"complete"')) void refreshRuntimeState();
  });

  const closeBoth = () => {
    if (chat) connectedClients.delete(browser);
    if (browser.readyState === WebSocket.OPEN || browser.readyState === WebSocket.CONNECTING) browser.close(1012, 'runner connection closed');
    if (runner.readyState === WebSocket.OPEN || runner.readyState === WebSocket.CONNECTING) runner.terminate();
  };
  browser.on('close', closeBoth);
  browser.on('error', closeBoth);
  runner.on('close', closeBoth);
  runner.on('error', (error) => {
    console.warn('[runner] chat socket to the runner failed', { error: String(error) });
    closeBoth();
  });
}
