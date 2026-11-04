import { useState } from 'react';
import { ShieldAlertIcon } from 'lucide-react';

import type { PendingPermissionRequest } from '@/shared/types';
import { Markdown } from '@/modules/chat/transcript/Markdown';
import { planNameOfPath, savePlan } from '@/modules/chat/plan/planFile';
import { openRightTab, planTabId } from '@/shared/hooks/useSplitPane';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/modules/chat/composer/Confirmation';

type Decision = { allow?: boolean; message?: string; updatedInput?: unknown; mode?: 'auto' };

/**
 * quests: a plan that waits for approval, above the input box (requirement 33). The plan itself is in the card,
 * and Noam can edit it there before he decides (Noam, 4 Nov: "it built a plan, gave the approval prompt, and then
 * did not show the plan. i clicked revise and it started thinking (about what?)"; "we should be able to see the
 * plan... and edit it").
 *   Build the plan  approves, and the chat builds in Auto mode (the process and the mode button); an edited plan
 *                   is saved to the plan file and handed to the chat as the plan (Noam, 4 Nov, after a build that
 *                   asked for every tool: "it keeps asking me permissions in auto mode")
 *   Revise          sends what should change, and the edit if there is one; it needs one of the two, so the chat
 *                   always knows what to revise
 */
export default function PlanApprovalCard({ request, onDecision }: { request: PendingPermissionRequest; onDecision: (d: Decision) => void }) {
  const input = (request.input && typeof request.input === 'object' ? request.input : {}) as { plan?: unknown; planFilePath?: unknown };
  const original = typeof input.plan === 'string' ? input.plan : '';
  const planName = planNameOfPath(input.planFilePath);
  const [text, setText] = useState(original);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const edited = text !== original;

  const decide = async (allow: boolean) => {
    try {
      if (edited && planName) await savePlan(planName, text);
    } catch (e) {
      setError(String((e as Error).message));
      return;
    }
    if (allow) {
      onDecision(edited ? { allow: true, mode: 'auto', updatedInput: { ...input, plan: text } } : { allow: true, mode: 'auto' });
      return;
    }
    const parts = ['The user asked to revise the plan.'];
    if (feedback.trim()) parts.push(`What should change: ${feedback.trim()}`);
    if (edited) parts.push(`The user edited the plan${planName ? ` and saved it to ${String(input.planFilePath)}` : ''}. The edited plan:\n\n${text}`);
    onDecision({ allow: false, message: parts.join('\n\n') });
  };

  return (
    <Confirmation approval="pending" data-quests-plan="approval">
      <ConfirmationTitle className="flex items-start gap-3">
        <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <ConfirmationRequest>
          <span className="font-medium text-foreground">The plan waits for your approval</span>
          <span className="ml-2 text-muted-foreground">Read it, edit it if you want, then build it or say what should change.</span>
        </ConfirmationRequest>
      </ConfirmationTitle>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <button type="button" data-quests-plan="edit" className="underline hover:text-foreground" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Show the plan' : 'Edit the plan'}
        </button>
        {edited && <span>edited</span>}
        {planName && (
          <button type="button" className="underline hover:text-foreground" onClick={() => openRightTab(planTabId(planName))}>
            Open in a tab
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          data-quests-plan="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-2 h-[50vh] w-full resize-y rounded border border-border bg-background p-2 font-mono text-xs text-foreground"
        />
      ) : (
        <div data-quests-plan="body" className="mt-2 max-h-[50vh] overflow-y-auto rounded border border-border/60 bg-background/60 px-3 py-2">
          <Markdown className="prose prose-sm max-w-none dark:prose-invert">{text}</Markdown>
        </div>
      )}
      <input
        data-quests-plan="feedback"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="What should change? (for Revise)"
        className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
      />
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
      <ConfirmationActions>
        <ConfirmationAction
          variant="outline"
          disabled={!feedback.trim() && !edited}
          title={!feedback.trim() && !edited ? 'Say what should change, or edit the plan' : undefined}
          onClick={() => void decide(false)}
        >
          Revise
        </ConfirmationAction>
        <ConfirmationAction variant="default" title="Approve the plan; the chat builds it in Auto mode" onClick={() => void decide(true)}>
          Build the plan
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  );
}
