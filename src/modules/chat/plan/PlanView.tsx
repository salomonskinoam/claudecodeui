import { memo, useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { Markdown } from '@/modules/chat/transcript/Markdown';
import { savePlan } from '@/modules/chat/plan/planFile';

type Plan = { text: string; modifiedAt: number };

/**
 * quests: a plan tab. Shows ~/.claude/plans/<planName>.md rendered as markdown, like Cursor opening the plan file
 * in a preview tab. Re-reads it every 3 seconds, so a revised plan shows without reopening the tab. "Edit" turns it
 * into a text box; "Save" writes the file (Noam, 4 Nov: "after plan mode; we should be able to see the plan... and
 * edit it"). While it is edited the re-read does not touch the text box.
 */
function PlanView({ planName }: { planName: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const save = async () => {
    if (draft === null) return;
    try {
      await savePlan(planName, draft);
      setDraft(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const response = await authenticatedFetch(`/api/quests/plan/${encodeURIComponent(planName)}`);
      if (stopped) {
        return;
      }
      if (!response.ok) {
        setError(response.status === 404 ? 'This plan file no longer exists.' : `Could not load the plan (${response.status}).`);
        return;
      }
      const next: Plan = await response.json();
      setError(null);
      setPlan((previous) => (previous?.modifiedAt === next.modifiedAt ? previous : next));
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [planName]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="pb-8 pl-12 pr-8 pt-4">
        <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>~/.claude/plans/{planName}.md</span>
          {plan && draft === null && (
            <button type="button" data-quests-plan="tab-edit" className="underline hover:text-foreground" onClick={() => setDraft(plan.text)}>Edit</button>
          )}
          {draft !== null && (
            <>
              <button type="button" data-quests-plan="tab-save" className="underline hover:text-foreground" onClick={() => void save()}>Save</button>
              <button type="button" className="underline hover:text-foreground" onClick={() => setDraft(null)}>Cancel</button>
            </>
          )}
        </div>
        {error && <div className="text-sm text-muted-foreground">{error}</div>}
        {draft !== null && (
          <textarea
            data-quests-plan="tab-text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-[75vh] w-full resize-y rounded border border-border bg-background p-2 font-mono text-xs text-foreground"
          />
        )}
        {plan && draft === null && (
          <Markdown className="prose prose-sm max-w-none dark:prose-invert">
            {plan.text}
          </Markdown>
        )}
      </div>
    </div>
  );
}

export default memo(PlanView);
