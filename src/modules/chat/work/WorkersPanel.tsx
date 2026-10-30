import { memo, useEffect, useRef, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { Shimmer } from '@/shared/ui';
import type { SessionActivity } from '@/shared/types';
import { formatTaskDuration } from '@/modules/chat/utils/backgroundTasks';
import { openWorkTab, type WorkKind } from '@/modules/chat/work/workTabs';

/**
 * quests: the state of the main chat, apart from the states of its workers (requirement 40). Noam, 30 Oct:
 * "i want a status separation between the state of the main chat and the state of sub workers, agents,
 * programs, tools". Read from the server every 3 seconds, which reads the live processes, the transcripts and
 * the task output files: a reload changes nothing.
 */

export type MainState = {
  state: 'answering' | 'permission' | 'question' | 'done' | 'waiting' | 'blocker' | 'idle';
  /** The current step while answering ("Bash: python hor.py status"). */
  step: string | null;
  /** The closing line's text for question, done, waiting and blocker. */
  text: string | null;
  /** Epoch ms the state began. */
  since: number | null;
};

export type Worker = {
  taskId: string;
  kind: 'agent' | 'command' | 'watcher' | 'workflow';
  name: string;
  /** What it is on: an agent's last step, a command's or watcher's last output line. */
  step: string | null;
  startedAt: number | null;
  /** When its transcript or output last grew; null when nothing of it is on disk. */
  lastActivityAt: number | null;
  tab: { kind: WorkKind; ref: string } | null;
};

export type WorkState = { main: MainState; workers: Worker[] };

const MAIN_LABEL: Record<MainState['state'], string> = {
  answering: 'Answering',
  permission: 'On a permission prompt',
  question: 'Waiting on you: question',
  done: 'Waiting on you: Done',
  waiting: 'Waiting for',
  blocker: 'Blocked',
  idle: 'Idle, no process',
};

const KIND_LABEL: Record<Worker['kind'], string> = { agent: 'Agent', command: 'Command', watcher: 'Watcher', workflow: 'Workflow' };

/** "alive" when it wrote in the last 20 seconds, else "quiet for 12m". */
function liveness(worker: Worker, now: number): { alive: boolean; text: string } {
  if (worker.lastActivityAt === null) return { alive: false, text: 'nothing on disk' };
  const quiet = now - worker.lastActivityAt;
  return quiet < 20_000 ? { alive: true, text: 'alive' } : { alive: false, text: `quiet for ${formatTaskDuration(quiet)}` };
}

const OPEN_STORE = 'quests-workers-open';

type WorkersPanelProps = {
  sessionId: string | null;
  /** The turn in flight as the page sees it live (the status frames), which beats the server's 3 second read. */
  activity: SessionActivity | null;
  onAbort?: () => void;
};

/**
 * One row for the chat, labelled "Chat", so it is never taken for a worker (Noam, 30 Oct, through another chat:
 * "unclear what is the main chat and what is the other message"). While a turn is in flight the live activity
 * fills the row (its step, its time, Stop); otherwise the server's state does.
 */
function WorkersPanel({ sessionId, activity, onAbort }: WorkersPanelProps) {
  const [state, setState] = useState<WorkState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The workers fold under the main line (Noam, 30 Oct: "the UI hides the entire screen right now, you have to
  // make this collapsable"); the choice is a per-viewer convenience kept in the browser.
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_STORE) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_STORE, o ? '0' : '1');
      } catch {
        /* no storage */
      }
      return !o;
    });
  };

  useEffect(() => {
    setState(null);
    if (!sessionId) return undefined;
    let stopped = false;
    const load = async () => {
      const response = await authenticatedFetch(`/api/quests/work/state/${encodeURIComponent(sessionId)}`);
      if (stopped || !response.ok) return;
      try {
        setState((await response.json()) as WorkState);
      } catch {
        /* an older server: the panel stays empty */
      }
    };
    void load();
    const poll = window.setInterval(() => void load(), 3000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [sessionId]);

  const inFlight = activity && !activity.background ? activity : null;
  // When the current step began: the moment its text changed (Noam, 30 Oct, through another chat: "nothing says
  // which time is the whole turn and which is the running command, nor whether it is stuck").
  const stepRef = useRef<{ text: string | null; since: number }>({ text: null, since: Date.now() });
  const stepText = inFlight ? inFlight.statusText ?? null : null;
  if (stepText !== stepRef.current.text) stepRef.current = { text: stepText, since: Date.now() };
  if (!sessionId || (!state && !inFlight)) return null;
  // A worker quiet for half an hour is not live, whatever the server still lists (Noam, 30 Oct: "350 minutes
  // idle is not live is it"); the Monitor tool itself gives up after 30 minutes.
  const workers = (state?.workers ?? []).filter((w) => now - (w.lastActivityAt ?? w.startedAt ?? now) < 30 * 60_000);
  const main: MainState = inFlight
    ? { state: 'answering', step: inFlight.statusText ?? state?.main.step ?? null, text: null, since: inFlight.startedAt }
    : state!.main;
  if (main.state === 'idle' && workers.length === 0) return null;
  const mainDetail = main.state === 'answering' ? main.step : main.text;

  return (
    <div className="pointer-events-auto mb-1 rounded-md border border-border/50 bg-card px-3 py-1.5 text-xs" data-quests-workers="panel">
      <div className="flex items-center gap-2" data-quests-workers="main">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${main.state === 'answering' ? 'animate-pulse bg-primary' : main.state === 'permission' ? 'bg-blue-400' : 'bg-muted-foreground/50'}`} />
        <span className="shrink-0 text-muted-foreground/70">Chat</span>
        {main.state === 'answering'
          ? <Shimmer className="shrink-0 font-medium">{`${MAIN_LABEL[main.state]}…`}</Shimmer>
          : <span className="shrink-0 font-medium text-foreground">{MAIN_LABEL[main.state]}</span>}
        {mainDetail && <span className="min-w-0 truncate text-muted-foreground" title={mainDetail}>{mainDetail}</span>}
        {inFlight && stepText && <span className="shrink-0 tabular-nums text-muted-foreground/70">for {formatTaskDuration(Math.max(0, now - stepRef.current.since))}</span>}
        {main.since !== null && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/60">{main.state === 'answering' ? 'turn ' : ''}{formatTaskDuration(Math.max(0, now - main.since))}</span>}
        {workers.length === 0 && main.state !== 'idle' && <span className="shrink-0 text-muted-foreground/50">no workers</span>}
        {inFlight?.canInterrupt && onAbort && (
          <button type="button" onClick={onAbort} data-quests-workers="stop" className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-destructive">
            Stop <kbd className="rounded border border-border/60 px-1 text-[10px]">esc</kbd>
          </button>
        )}
        {workers.length > 0 && (
          <button type="button" data-quests-workers="toggle" onClick={toggle} className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            {open ? '▾' : '▸'} {workers.length} {workers.length === 1 ? 'worker' : 'workers'}
          </button>
        )}
      </div>
      {open && <div className="max-h-40 overflow-y-auto">{workers.map((worker) => {
        const life = liveness(worker, now);
        return (
          <div key={worker.taskId} className="mt-1 flex items-center gap-2 border-t border-border/30 pt-1" data-quests-workers="worker">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${life.alive ? 'animate-pulse bg-purple-500 dark:bg-purple-400' : 'bg-muted-foreground/40'}`} />
            <span className="shrink-0 font-medium text-foreground">{KIND_LABEL[worker.kind]}</span>
            <span className="min-w-0 truncate" title={worker.name}>{worker.name}</span>
            {worker.step && <span className="min-w-0 truncate text-muted-foreground/80" title={worker.step}>· {worker.step}</span>}
            <span className={`ml-auto shrink-0 ${life.alive ? 'text-purple-500 dark:text-purple-300' : 'text-muted-foreground/70'}`}>{life.text}</span>
            {worker.startedAt !== null && <span className="shrink-0 tabular-nums text-muted-foreground/60">{formatTaskDuration(Math.max(0, now - worker.startedAt))}</span>}
            {worker.tab && (
              <button
                type="button"
                title="Open as a tab"
                data-quests-workers="open"
                onClick={() => openWorkTab(sessionId, worker.tab!.kind, worker.tab!.ref, `${KIND_LABEL[worker.kind]}: ${worker.name}`)}
                className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                tab
              </button>
            )}
          </div>
        );
      })}</div>}
    </div>
  );
}

export default memo(WorkersPanel);
