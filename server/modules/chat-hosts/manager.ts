import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { chatHostsDb, listenersDb, scheduledMessagesDb, sessionDraftsDb, sessionsDb } from '@/modules/database/index.js';
import type { ListenerRow } from '@/modules/database/index.js';
import { getQueue, queueReady } from '@/modules/queue/index.js';
import { logEvent } from '@/modules/events/index.js';
import { isUnanswering, refreshRuntimeState, runtimeState, setChatMarks } from '@/shared/runtime-state.js';
import { unitPrefix } from '@/shared/quests-instance.js';
import { findApplicationRoot, getModuleDirectory } from '@/shared/utils.js';

import { controlConnection, ensureHost, onHostStarted, sendToChat } from './hosts.js';
import { decide, type Action, type ChatFacts, type Facts } from './reconcile.js';

/**
 * quests: runs the check (reconcile.ts) and does what it says. Started with the page server: once at start (after a
 * reboot this is the backfill), every 30 s, and when a chat service's control socket closes. It also keeps one
 * control connection per live chat service, so a change of state reaches the queue and the dots at once.
 */

const run = promisify(execFile);
const LISTEN_RUN = path.join(findApplicationRoot(getModuleDirectory(import.meta.url)), 'quests', 'bin', 'quests-listen-run');
const CHECK_MS = 30_000;

async function activeUnits(prefix: string): Promise<Set<string>> {
  const { stdout } = await run('systemctl', ['--user', 'list-units', `${prefix}*`, '--state=active,activating', '--plain', '--no-legend']);
  return new Set(stdout.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean).map((u) => u.slice(prefix.length, -'.service'.length)));
}

function tail(file: string, lines = 20): string {
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch (error) {
    return `(log unreadable: ${String(error)})`;
  }
}

async function gather(): Promise<Facts> {
  const [units, listenerUnits] = await Promise.all([activeUnits(`${unitPrefix()}-chat-`), activeUnits(`${unitPrefix()}-listen-`)]);
  const state = runtimeState();
  const hosts = chatHostsDb.list();
  const listeners = listenersDb.list();
  const chats = new Map<string, ChatFacts & { sessionId: string }>();
  for (const e of getQueue().entries) {
    if (!e.sessionId) continue;
    const facts = { sessionId: e.sessionId, placement: e.placement, outside: e.heldOutside, activityAt: e.activityAt };
    chats.set(e.sessionId, facts);
    if (e.providerSessionId) chats.set(e.providerSessionId, facts);
  }
  // A listener's chat may not be in the queue (no message of Noam's yet, or not open): find it by its session row.
  for (const l of listeners) {
    if (l.ended_at && l.delivered_at) continue;
    if (chats.has(l.session_id)) continue;
    const row = sessionsDb.getSessionByProviderSessionId(l.session_id) ?? sessionsDb.getSessionById(l.session_id);
    if (row) chats.set(l.session_id, { sessionId: row.session_id, placement: 'queue', outside: false, activityAt: 0 });
  }
  const logChangedAt = new Map<string, number>();
  for (const l of listeners) {
    if (!l.ended_at) {
      try { logChangedAt.set(l.id, fs.statSync(l.log_path).mtimeMs); } catch { /* not written yet: counts from its start */ }
    }
  }
  // Hung is judged by the transcript's last write: a tool call, a tool result or a reply.
  const transcriptAt = new Map<string, number>();
  for (const h of hosts) {
    if (h.ended_at || !h.turn_open) continue;
    const file = sessionsDb.getSessionById(h.session_id)?.jsonl_path;
    if (file) {
      try { transcriptAt.set(h.session_id, fs.statSync(file).mtimeMs); } catch { /* moved: the record's times count */ }
    }
  }
  const now = new Date();
  return {
    transcriptAt,
    now: now.getTime(),
    hosts,
    activeUnits: units,
    unanswering: new Set(hosts.map((h) => h.session_id).filter(isUnanswering)),
    workers: new Set(state.background.filter((b) => b.tasks.length > 0).map((b) => b.sessionId)),
    listeners,
    activeListenerUnits: listenerUnits,
    logChangedAt,
    chats,
    due: [...scheduledMessagesDb.listDueSessionIds(now), ...sessionDraftsDb.listQueuedMessages().map((m) => m.sessionId)],
  };
}

async function apply(a: Action, listeners: ListenerRow[]): Promise<void> {
  logEvent('server', `manager.${a.kind}`, 'sessionId' in a ? a.sessionId : null, 'listenerId' in a ? { listener: a.listenerId } : {});
  switch (a.kind) {
    case 'wake':
      console.log(`[manager] waking ${a.sessionId}: its service ended with work open`);
      chatHostsDb.addWake(a.sessionId, new Date().toISOString());
      await sendToChat(a.sessionId, a.text);
      return;
    case 'endHost':
      chatHostsDb.end(a.sessionId);
      return;
    case 'listenerResult':
      console.log(`[manager] listener ${a.listenerId} ended; telling ${a.sessionId}`);
      listenersDb.markDelivered(a.listenerId);
      await sendToChat(a.sessionId, a.text);
      return;
    case 'listenerSeen':
      listenersDb.markDelivered(a.listenerId);
      return;
    case 'restartListener': {
      const l = listeners.find((x) => x.id === a.listenerId);
      console.log(`[manager] listener ${a.listenerId} (${l?.name}) died without an exit; starting it again`);
      listenersDb.markRestarted(a.listenerId);
      await run('systemd-run', ['--user', '--collect', '--unit', `${unitPrefix()}-listen-${a.listenerId}`, `--description=quests listener ${l?.name ?? a.listenerId}`, `--setenv=QUESTS_INSTANCE=${process.env.QUESTS_INSTANCE}`, LISTEN_RUN, a.listenerId]);
      return;
    }
    case 'start':
      await ensureHost(a.sessionId);
  }
}

const controls = new Map<string, ReturnType<typeof controlConnection>>();
const changeListeners = new Set<() => void>();
/** Called when any chat's state changed (a turn, an approval, a process, a listener): the page reads again. */
export const onChatsChanged = (f: () => void): void => { changeListeners.add(f); };
const changed = () => { void refreshRuntimeState().then(() => { for (const f of changeListeners) f(); }); };

function watchControls(active: Set<string>): void {
  for (const sid of active) {
    if (controls.has(sid)) continue;
    const ws = controlConnection(sid, changed);
    controls.set(sid, ws);
    ws.on('close', () => {
      controls.delete(sid);
      changed();
      // A service that closed may have died with work open: check now, not in 30 s.
      setTimeout(() => void check(), 1000);
    });
  }
}

let running = false;
let again = false;
let lastMarks = '';
export async function check(): Promise<void> {
  // One check at a time; a check asked for meanwhile runs right after, so no change waits for the next 30 s.
  if (running) { again = true; return; }
  if (!queueReady()) return; // the next check, at most 30 s later, finds it loaded
  running = true;
  again = false;
  try {
    const facts = await gather();
    watchControls(facts.activeUnits);
    const { actions, marks } = decide(facts, (l) => tail(l.log_path));
    setChatMarks(marks);
    const nextMarks = JSON.stringify(marks);
    if (nextMarks !== lastMarks) {
      console.log(`[manager] marks ${nextMarks}`);
      lastMarks = nextMarks;
      for (const f of changeListeners) f();
    }
    for (const a of actions) {
      await apply(a, facts.listeners).catch((error: unknown) => console.warn(`[manager] ${a.kind} failed`, { error: String(error) }));
    }
  } finally {
    running = false;
    if (again) void check();
  }
}

// The event log: a listener that started, or ended with its exit code. The first read only learns what is there.
let knownListeners: Map<string, boolean> | null = null;
function noteListeners(): void {
  const rows = listenersDb.list();
  if (knownListeners) {
    for (const l of rows) {
      const ended = Boolean(l.ended_at);
      if (!knownListeners.has(l.id)) logEvent('server', 'listener.started', l.session_id, { listener: l.id, name: l.name });
      if (ended && knownListeners.get(l.id) !== true) logEvent('server', 'listener.ended', l.session_id, { listener: l.id, name: l.name, exit: l.exit_code });
    }
  }
  knownListeners = new Map(rows.map((l) => [l.id, Boolean(l.ended_at)]));
}

let timer: NodeJS.Timeout | null = null;
let listenerSignature = '';
export function startManager(): void {
  if (timer) return;
  void check();
  timer = setInterval(() => void check(), CHECK_MS);
  timer.unref?.();
  // A chat service that just started: hear its changes from its first turn on, and tell the pages now.
  onHostStarted((sid) => { watchControls(new Set([sid])); changed(); });
  // A listener started or ended (quests-listen and its wrapper write the table): check now, so its pink dot or
  // its result comes at once. One small read every second.
  const listenerWatch = setInterval(() => {
    const next = listenersDb.signature();
    if (next !== listenerSignature) { listenerSignature = next; noteListeners(); void check(); }
  }, 1000);
  listenerWatch.unref?.();
}
