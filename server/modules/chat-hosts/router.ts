import { WebSocket } from 'ws';

import { connectedClients } from '@/modules/websocket/index.js';
import { chatSocket, refreshRuntimeState } from '@/shared/runtime-state.js';
import type { AuthenticatedWebSocketRequest } from '@/shared/types.js';

import { ensureHost, fanOutUpsert, onHostStarted, socketAnswers } from './hosts.js';

/**
 * quests: the browser's chat socket (`/ws`) in the manager. Every frame names its chat, so each goes to that chat's
 * own service (starting it for a send). Events come
 * back on the same browser socket. A service that exits (idle, crash) closes only its own upstream; the browser
 * socket stays open.
 *
 * Two frames need more than a session id: `chat.subscribe` can name several chats (split per chat), and
 * `chat.permission-response` names only its request (routed by the `permission_request` it answers, else sent to
 * every upstream: an unknown request id is ignored by the others).
 */

type Frame = { type?: string; sessionId?: string; sessions?: Array<{ sessionId?: string }>; requestId?: string };
const conns = new Set<Conn>();

class Conn {
  upstreams = new Map<string, WebSocket>();
  subscribed = new Set<string>();
  requests = new Map<string, string>();
  /** Chats this window is starting with its own send: its send attaches it to the run already. */
  starting = new Set<string>();

  constructor(readonly browser: WebSocket, readonly query: string) {}

  upstream(target: string): Promise<WebSocket> {
    const open = this.upstreams.get(target);
    if (open && open.readyState === WebSocket.OPEN) return Promise.resolve(open);
    const ws = open && open.readyState === WebSocket.CONNECTING ? open : new WebSocket(`ws+unix:${chatSocket(target)}:/ws${this.query}`);
    if (ws !== open) {
      this.upstreams.set(target, ws);
      ws.on('message', (data, isBinary) => this.fromUpstream(target, data, isBinary));
      const drop = () => { if (this.upstreams.get(target) === ws) this.upstreams.delete(target); };
      ws.on('close', drop);
      ws.on('error', (error) => { console.warn(`[chat-hosts] upstream ${target} failed`, { error: String(error) }); drop(); });
    }
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) return resolve(ws);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  fromUpstream(target: string, data: WebSocket.RawData, isBinary: boolean): void {
    const text = isBinary ? '' : data.toString();
    if (text.includes('"session_upserted"')) {
      fanOutUpsert(text);
      return;
    }
    if (text.includes('"permission_request"')) {
      const id = /"requestId"\s*:\s*"([^"]+)"/.exec(text)?.[1];
      if (id) this.requests.set(id, target);
    }
    if (this.browser.readyState === WebSocket.OPEN) this.browser.send(data, { binary: isBinary });
    if (text.length < 4000 && text.includes('"kind":"complete"')) void refreshRuntimeState();
  }

  async forward(target: string, frame: Frame, start: boolean): Promise<void> {
    if (start) await ensureHost(target);
    else if (!(await socketAnswers(chatSocket(target)))) {
      // No service: nothing runs for this chat. Answer as a service with no run would.
      if (frame.type === 'chat.subscribe') this.send({ kind: 'chat_subscribed', sessionId: target, isProcessing: false, lastSeq: 0, pendingPermissions: [], timestamp: new Date().toISOString() });
      else this.send({ kind: 'protocol_error', code: 'NO_ACTIVE_RUN', error: 'No run is active for this session.', sessionId: target, timestamp: new Date().toISOString() });
      return;
    }
    (await this.upstream(target)).send(JSON.stringify(frame));
  }

  send(event: Record<string, unknown>): void {
    if (this.browser.readyState === WebSocket.OPEN) this.browser.send(JSON.stringify(event));
  }

  async fromBrowser(raw: string): Promise<void> {
    const frame = JSON.parse(raw) as Frame;
    const sid = typeof frame.sessionId === 'string' ? frame.sessionId.trim() : '';
    switch (frame.type) {
      case 'chat.send':
      case 'chat.edit-send':
        this.subscribed.add(sid);
        this.starting.add(sid);
        await this.forward(sid, frame, true).finally(() => setTimeout(() => this.starting.delete(sid), 1000));
        // A send changes what runs: the queue and the dots read the state again at once.
        setTimeout(() => void refreshRuntimeState(), 300);
        return;
      case 'chat.abort':
        await this.forward(sid, frame, false);
        setTimeout(() => void refreshRuntimeState(), 300);
        return;
      case 'chat.stop-task':
        await this.forward(sid, frame, false);
        return;
      case 'chat.subscribe':
        for (const entry of frame.sessions ?? []) {
          const id = typeof entry?.sessionId === 'string' ? entry.sessionId.trim() : '';
          if (!id) continue;
          this.subscribed.add(id);
          await this.forward(id, { type: 'chat.subscribe', sessions: [entry] }, false);
        }
        return;
      case 'chat.permission-response': {
        const target = frame.requestId ? this.requests.get(frame.requestId) : undefined;
        const targets = target ? [target] : [...this.upstreams.keys()];
        for (const t of targets) (await this.upstream(t)).send(raw);
        return;
      }
      default:
        this.send({ kind: 'protocol_error', code: 'UNKNOWN_MESSAGE_TYPE', error: `Unknown message type: ${String(frame.type)}`, sessionId: null, timestamp: new Date().toISOString() });
    }
  }

  close(): void {
    conns.delete(this);
    connectedClients.delete(this.browser);
    for (const ws of this.upstreams.values()) ws.terminate();
  }
}

// A chat whose service just started (a send from another window, a wake after a crash, a listener's result, a
// scheduled message): every other browser showing that chat subscribes to the new run, from its first event.
onHostStarted((sessionId) => {
  setTimeout(() => {
    for (const c of conns) {
      if (c.subscribed.has(sessionId) && !c.starting.has(sessionId)) void c.forward(sessionId, { type: 'chat.subscribe', sessions: [{ sessionId }] }, false).catch(() => undefined);
    }
  }, 500);
});

export function handleBrowserChat(browser: WebSocket, request: AuthenticatedWebSocketRequest): void {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const conn = new Conn(browser, url.search);
  conns.add(conn);
  connectedClients.add(browser);
  // Frames are handled in order, one at a time, as one socket would.
  let chain = Promise.resolve();
  browser.on('message', (data, isBinary) => {
    if (isBinary) return;
    const raw = data.toString();
    chain = chain.then(() => conn.fromBrowser(raw)).catch((error: unknown) => {
      console.warn('[chat-hosts] frame failed', { error: String(error) });
      conn.send({ kind: 'protocol_error', code: 'INTERNAL_ERROR', error: String(error), sessionId: null, timestamp: new Date().toISOString() });
    });
  });
  browser.on('close', () => conn.close());
  browser.on('error', () => conn.close());
}
