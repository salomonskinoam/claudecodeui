import type { ChatHostRow, ListenerRow } from '@/modules/database/index.js';
import type { ChatMark } from '@/shared/runtime-state.js';

/**
 * quests: the manager's check, as one pure function. It runs at the manager's start, every 30 s, and whenever a
 * chat service's socket closes. It compares the records (chat_hosts, listeners) with what runs (systemd units,
 * sockets) and returns what to do and what to show. The side effects are in manager.ts.
 *
 * | Case                                        | Action                                                      |
 * |---------------------------------------------|-------------------------------------------------------------|
 * | service gone, turn open or process held     | wake: start it and tell the chat its process ended          |
 * | 3 wakes in the last hour                    | no wake; mark keepsDying (the chat goes to Pending)         |
 * | service gone, nothing open                  | end the record                                              |
 * | turn open, no event for 30 min, no worker   | mark hung; never killed                                     |
 * | service alive but /state does not answer    | mark hung                                                   |
 * | listener ended, page chat                   | send the chat the exit code and the last lines              |
 * | listener ended, chat open in Cursor         | mark listenerEnded until the chat moves again               |
 * | listener gone without an exit (reboot)      | start it again (at most 5 times)                            |
 * | listener runs, log silent for 2 h           | mark listenerSilent; else mark listener                     |
 * | message due, no service                     | start the service (it sends its own due messages)           |
 */

export const HUNG_MS = Number(process.env.QUESTS_HUNG_MS ?? 30 * 60_000);
export const SILENT_MS = Number(process.env.QUESTS_LISTENER_SILENT_MS ?? 2 * 3600_000);
const WAKE_WINDOW_MS = 3600_000;
const MAX_WAKES = 3;
const MAX_LISTENER_RESTARTS = 5;

export type ChatFacts = {
  /** Where Noam put it; a chat on hold or archived is not woken. */
  placement: 'queue' | 'hold' | 'archive';
  /** The chat runs in Cursor (or a terminal), not in a page chat service: nothing may be typed into it. */
  outside: boolean;
  /** The last time the chat moved (its transcript), epoch ms. */
  activityAt: number;
};

export type Facts = {
  now: number;
  hosts: ChatHostRow[];
  /** Page session ids whose quests-chat-<id> unit is active. */
  activeUnits: Set<string>;
  /** Page session ids whose service is alive but did not answer /state. */
  unanswering: Set<string>;
  /** Page session ids with live background work (agents, commands). */
  workers: Set<string>;
  /** Page session id -> its transcript's last write, epoch ms, for the chats with a turn open. */
  transcriptAt: Map<string, number>;
  listeners: ListenerRow[];
  /** Listener ids whose quests-listen-<id> unit is active. */
  activeListenerUnits: Set<string>;
  /** Listener id -> its log's last change, epoch ms. */
  logChangedAt: Map<string, number>;
  /** Claude or page session id -> the chat's page session id and its queue facts. */
  chats: Map<string, ChatFacts & { sessionId: string }>;
  /** Page session ids with a scheduled or queued message due. */
  due: string[];
};

export type Action =
  | { kind: 'wake'; sessionId: string; text: string }
  | { kind: 'endHost'; sessionId: string }
  | { kind: 'listenerResult'; listenerId: string; sessionId: string; text: string }
  | { kind: 'listenerSeen'; listenerId: string }
  | { kind: 'restartListener'; listenerId: string }
  | { kind: 'start'; sessionId: string };

const at = (iso: string | null): number => (iso ? Date.parse(iso) : 0);
const time = (ms: number): string => new Date(ms).toLocaleString('en-GB', { timeZone: 'America/Asuncion', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function wakeText(endedAt: number): string {
  return `Message from the quests manager: your process ended at ${time(endedAt)} (a crash or a reboot). Its subagents, background commands, monitors and workflows died with it. Check what still runs, start again what you need, and continue what you were doing.`;
}

export function listenerText(l: ListenerRow, lastLines: string): string {
  return `Message from the quests manager: your listener "${l.name}" ended with exit code ${l.exit_code} at ${time(at(l.ended_at))}. Last lines of its log (${l.log_path}):\n\n${lastLines}\n\nContinue what you were waiting for.`;
}

export function decide(f: Facts, lastLines: (l: ListenerRow) => string): { actions: Action[]; marks: Record<string, ChatMark[]> } {
  const actions: Action[] = [];
  const marks: Record<string, ChatMark[]> = {};
  const mark = (sid: string, m: ChatMark) => { (marks[sid] ??= []).push(m); };

  for (const h of f.hosts) {
    if (h.ended_at) continue;
    const sid = h.session_id;
    if (f.activeUnits.has(sid)) {
      const silentFor = f.now - Math.max(at(h.last_event_at), at(h.turn_started_at), f.transcriptAt.get(sid) ?? 0);
      if (f.unanswering.has(sid) || (h.turn_open && silentFor > HUNG_MS && !f.workers.has(sid))) mark(sid, 'hung');
      continue;
    }
    if (!h.turn_open && !h.held) {
      actions.push({ kind: 'endHost', sessionId: sid });
      continue;
    }
    const chat = f.chats.get(sid);
    if (chat && chat.placement !== 'queue') {
      actions.push({ kind: 'endHost', sessionId: sid });
      continue;
    }
    const recent = (JSON.parse(h.wakes) as string[]).filter((w) => f.now - Date.parse(w) < WAKE_WINDOW_MS);
    if (recent.length >= MAX_WAKES) {
      mark(sid, 'keepsDying');
      continue;
    }
    actions.push({ kind: 'wake', sessionId: sid, text: wakeText(Math.max(at(h.last_event_at), at(h.started_at))) });
  }

  for (const l of f.listeners) {
    const chat = f.chats.get(l.session_id);
    const sid = chat?.sessionId ?? l.session_id;
    if (l.ended_at) {
      if (l.delivered_at) continue;
      if (!chat || chat.placement === 'archive') { actions.push({ kind: 'listenerSeen', listenerId: l.id }); continue; }
      if (!chat.outside) { actions.push({ kind: 'listenerResult', listenerId: l.id, sessionId: sid, text: listenerText(l, lastLines(l)) }); continue; }
      if (chat.activityAt > at(l.ended_at)) actions.push({ kind: 'listenerSeen', listenerId: l.id });
      else mark(sid, 'listenerEnded');
      continue;
    }
    if (!f.activeListenerUnits.has(l.id)) {
      if (l.restarts < MAX_LISTENER_RESTARTS) actions.push({ kind: 'restartListener', listenerId: l.id });
      continue;
    }
    const changed = f.logChangedAt.get(l.id) ?? at(l.started_at);
    mark(sid, f.now - changed > SILENT_MS ? 'listenerSilent' : 'listener');
  }

  for (const sid of new Set(f.due)) {
    if (!f.activeUnits.has(sid) && !actions.some((a) => a.kind === 'wake' && a.sessionId === sid)) actions.push({ kind: 'start', sessionId: sid });
  }
  return { actions, marks };
}
