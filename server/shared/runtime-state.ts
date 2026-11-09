import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { BackgroundTaskSummary, LLMProvider } from '@/shared/types.js';

/**
 * quests: the runner (server/runner.ts, its own service) owns the chats' Claude processes, so a restart of the
 * page server never stops a turn, a subagent or a background command. The page server keeps a copy of the
 * runner's state, read from the runner's socket every second and when a chat starts or ends, and everything in
 * the page server that asks "is this chat running" reads the copy.
 */

export const RUNNER_SOCKET = path.join(process.env.XDG_RUNTIME_DIR ?? os.tmpdir(), 'quests-runner.sock');
/** quests: each chat service (server/runner.ts with QUESTS_CHAT set) listens on its own socket in this folder. */
export const CHATS_DIR = path.join(process.env.XDG_RUNTIME_DIR ?? os.tmpdir(), 'quests');
export const chatSocket = (sessionId: string): string => path.join(CHATS_DIR, `chat-${sessionId}.sock`);
export const chatUnit = (sessionId: string): string => `quests-chat-${sessionId}`;

export type RuntimeRun = {
  sessionId: string;
  runId: string;
  provider: LLMProvider;
  status: 'running' | 'completed';
  startedAt: number;
  lastSeq: number;
};

export type RuntimeState = {
  /** Every run the runner holds, running or recently completed, by the page's session id. */
  runs: RuntimeRun[];
  /** Pending tool approvals by the page's session id. */
  approvals: Record<string, unknown[]>;
  /** The sessions whose Claude process is inside a turn now, whoever started it. */
  inFlight: string[];
  /** Each session's last step (the tool it runs, or "thinking"). */
  lastSteps: Record<string, { text: string; at: number }>;
  /** The sessions whose background work outlived their turn. */
  background: Array<{ sessionId: string; provider: LLMProvider; tasks: BackgroundTaskSummary[] }>;
  /** When each live Claude process started, by every id it is held under. */
  startTimes: Record<string, number>;
};

export const EMPTY_RUNTIME_STATE: RuntimeState = { runs: [], approvals: {}, inFlight: [], lastSteps: {}, background: [], startTimes: {} };
let copy: RuntimeState = EMPTY_RUNTIME_STATE;
let warned = false;
// Called with each session whose Claude process started or ended (server/index.ts drops its cached history).
let onProcessChange: (sessionId: string) => void = () => undefined;
export const setOnProcessChange = (f: (sessionId: string) => void): void => { onProcessChange = f; };

export const runtimeState = (): RuntimeState => copy;
/** Sets the copy directly: the tests, which run no runner. */
export const setRuntimeState = (state: RuntimeState): void => { copy = state; };
export const runOf = (sessionId: string): RuntimeRun | undefined => copy.runs.find((r) => r.sessionId === sessionId);
export const runningRuns = (): RuntimeRun[] => copy.runs.filter((r) => r.status === 'running');
export const approvalsOf = (sessionId: string): unknown[] => copy.approvals[sessionId] ?? [];
export const isTurnInFlight = (sessionId: string): boolean => copy.inFlight.includes(sessionId);
export const lastStepOf = (sessionId: string) => copy.lastSteps[sessionId] ?? null;
export const startTimeOf = (sessionId: string): number | null => copy.startTimes[sessionId] ?? null;

function fetchState(): Promise<RuntimeState> {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath: RUNNER_SOCKET, path: '/state', timeout: 2000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as RuntimeState);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('runner state timed out')));
    req.on('error', reject);
  });
}

/** Reads the runner's state now. With the runner down nothing runs: the copy is empty. */
export async function refreshRuntimeState(): Promise<void> {
  let next: RuntimeState;
  try {
    next = await fetchState();
    warned = false;
  } catch (error) {
    if (!warned) console.warn('[runner] state unavailable; no chat counts as running until it answers', { error: String(error) });
    warned = true;
    next = EMPTY_RUNTIME_STATE;
  }
  // A session's history says whether its background agents run from whether its process is live: a process that
  // started or ended makes its cached history stale (session-history-cache.service.ts).
  for (const id of new Set([...Object.keys(copy.startTimes), ...Object.keys(next.startTimes)])) {
    if (copy.startTimes[id] !== next.startTimes[id]) onProcessChange(id);
  }
  copy = next;
}

let timer: NodeJS.Timeout | null = null;
export function startRuntimeStatePoll(): void {
  if (timer) return;
  void refreshRuntimeState();
  timer = setInterval(() => void refreshRuntimeState(), 1000);
  timer.unref?.();
}
