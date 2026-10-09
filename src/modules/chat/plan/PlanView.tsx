import { memo, useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { Markdown } from '@/modules/chat/transcript/Markdown';

type Plan = { text: string; modifiedAt: number };

/**
 * quests: a plan tab. Shows ~/.claude/plans/<planName>.md rendered as markdown, like Cursor opening the plan file
 * in a preview tab. Re-reads it every 3 seconds, so a revised plan shows without reopening the tab.
 */
function PlanView({ planName }: { planName: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <div className="mb-3 text-xs text-muted-foreground">~/.claude/plans/{planName}.md</div>
        {error && <div className="text-sm text-muted-foreground">{error}</div>}
        {plan && (
          <Markdown className="prose prose-sm max-w-none dark:prose-invert">
            {plan.text}
          </Markdown>
        )}
      </div>
    </div>
  );
}

export default memo(PlanView);
