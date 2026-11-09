import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { chatHostsDb, listenersDb, scheduledMessagesDb, sessionDraftsDb } from '@/modules/database/index.js';
import type { ListenerRow } from '@/modules/database/index.js';
import { getQueue } from '@/modules/queue/index.js';
import { isUnanswering, refreshRuntimeState, runtimeState, setChatMarks } from '@/shared/runtime-state.js';
import { findApplicationRoot, getModuleDirectory } from '@/shared/utils.js';

import { controlConnection, ensureHost, sendToChat } from './hosts.js';
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
  const [units, listenerUnits] = await Promise.all([activeUnits('quests-chat-'), activeUnits('quests-listen-')]);
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
  const logChangedAt = new Map<string, number>();
  for (const l of listeners) {
    if (!l.ended_at) {
      try { logChangedAt.set(l.id, fs.statSync(l.log_path).mtimeMs); } catch { /* not written yet: counts from its start */ }
    }
  }
  const now = new Date();
  return {
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
      await run('systemd-run', ['--user', '--collect', '--unit', `quests-listen-${a.listenerId}`, `--description=quests listener ${l?.name ?? a.listenerId}`, LISTEN_RUN, a.listenerId]);
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
let lastMarks = '';
export async function check(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const facts = await gather();
    watchControls(facts.activeUnits);
    const { actions, marks } = decide(facts, (l) => tail(l.log_path));
    setChatMarks(marks);
    const nextMarks = JSON.stringify(marks);
    if (nextMarks !== lastMarks) { lastMarks = nextMarks; for (const f of changeListeners) f(); }
    for (const a of actions) {
      await apply(a, facts.listeners).catch((error: unknown) => console.warn(`[manager] ${a.kind} failed`, { error: String(error) }));
    }
  } finally {
    running = false;
  }
}

let timer: NodeJS.Timeout | null = null;
export function startManager(): void {
  if (timer) return;
  void check();
  timer = setInterval(() => void check(), CHECK_MS);
  timer.unref?.();
}
