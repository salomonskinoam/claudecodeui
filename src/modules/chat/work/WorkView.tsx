import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { workOf } from '@/shared/hooks/useSplitPane';
import type { SubagentActivity, SubagentInfo } from '@/shared/types';
import { SubagentTimeline } from '@/modules/chat/tools/SubagentTimeline';
import { formatTaskDuration } from '@/modules/chat/utils/backgroundTasks';
import { createCachedDiffCalculator } from '@/modules/chat/utils/messageTransforms';
import { setWorkTitle } from '@/modules/chat/work/workTabs';

type AgentTab = { activity: SubagentActivity[]; info: Omit<SubagentInfo, 'status'> & { lastAt?: string } };
type OutputTab = { text: string; size: number; modifiedAt: number; truncated: boolean; file?: string };

/** Re-reads `url` every `everyMs`; a 404 says the thing is gone. */
function usePolled<T>(url: string, everyMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const response = await authenticatedFetch(url);
      if (stopped) return;
      if (!response.ok) {
        setError(response.status === 404 ? 'Nothing here any more.' : `Could not load (${response.status}).`);
        return;
      }
      try {
        setData((await response.json()) as T);
        setError(null);
      } catch {
        setError('The server gave no readable answer (an older server?).');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), everyMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [url, everyMs]);
  return { data, error };
}

/** An agent's tab: its task, its figures, its last step, and its whole timeline, re-read every 3 seconds. */
function AgentWork({ tabId, workRef }: { tabId: string; workRef: string }) {
  const { data, error } = usePolled<AgentTab>(`/api/quests/work/agent/${workRef}`, 3000);
  const createDiff = useMemo(() => createCachedDiffCalculator(), []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (data?.info.description) setWorkTitle(tabId, `Agent: ${data.info.description}`);
  }, [tabId, data?.info.description]);

  const info = data?.info;
  const lastAt = info?.lastAt ? Date.parse(info.lastAt) : NaN;
  // Alive: its transcript grew in the last 20 seconds. The transcript cannot say whether the agent finished.
  const alive = Number.isFinite(lastAt) && now - lastAt < 20_000;
  const tokens = info?.usage?.totalTokens ?? 0;
  const figures = info
    ? [
      `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tokens`,
      `${info.usage?.toolUses ?? 0} tools`,
      formatTaskDuration(alive && info.startedAt ? now - Date.parse(info.startedAt) : info.usage?.durationMs ?? 0),
    ].join(' · ')
    : '';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background" data-quests-work="agent">
      <div className="pb-8 pl-6 pr-6 pt-4">
        {error && <div className="text-sm text-muted-foreground">{error}</div>}
        {info && (
          <div className="mb-3 border-l-2 border-l-purple-500 pl-3 text-xs text-muted-foreground dark:border-l-purple-400">
            <div className="flex items-center gap-2">
              {alive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500 dark:bg-purple-400" />}
              <span className="font-medium text-foreground">{info.type ?? 'Agent'}</span>
              {info.description && <span className="min-w-0 truncate">{info.description}</span>}
              <span className="ml-auto tabular-nums">{figures}</span>
            </div>
            {info.lastStep && <div className="mt-1 truncate" title={info.lastStep}>· {info.lastStep}</div>}
            {info.model && <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/50">{info.model}</div>}
          </div>
        )}
        {data && <SubagentTimeline activity={data.activity} activityCount={data.info.activityCount} createDiff={createDiff} />}
      </div>
    </div>
  );
}

/** A command's or watcher's tab: the tail of its output file, re-read every 2 seconds, following the end. */
function OutputWork({ kind, workRef }: { kind: 'output' | 'task'; workRef: string }) {
  const { data, error } = usePolled<OutputTab>(`/api/quests/work/${kind}/${workRef}`, 2000);
  const pane = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  useEffect(() => {
    const p = pane.current;
    if (p && atEnd.current) p.scrollTop = p.scrollHeight;
  }, [data?.text]);

  return (
    <div
      ref={pane}
      className="min-h-0 flex-1 overflow-y-auto bg-background"
      data-quests-work="output"
      onScroll={(event) => {
        const p = event.currentTarget;
        atEnd.current = p.scrollHeight - p.scrollTop - p.clientHeight < 8;
      }}
    >
      <div className="pb-8 pl-6 pr-6 pt-4">
        <div className="mb-3 text-xs text-muted-foreground">
          {data?.file ?? `/${workRef}`}
          {data && ` · ${data.size} bytes${data.truncated ? ', last 256 KB shown' : ''}`}
        </div>
        {error && <div className="text-sm text-muted-foreground">{error}</div>}
        {data && <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">{data.text}</pre>}
      </div>
    </div>
  );
}

/** quests: a work tab (route /work/<kind>/<ref>): an agent, or a backgrounded command's output. Read-only. */
function WorkView({ tabId }: { tabId: string }) {
  const work = workOf(tabId);
  if (!work) return null;
  return work.kind === 'agent'
    ? <AgentWork tabId={tabId} workRef={work.ref} />
    : <OutputWork kind={work.kind === 'task' ? 'task' : 'output'} workRef={work.ref} />;
}

export default memo(WorkView);
