import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { isEmbedded, openTabAfter, planTabId } from '@/shared/hooks/useSplitPane';
import type { ChatMessage } from '@/shared/types';

/** The plan file name of an ExitPlanMode call (planFilePath ~/.claude/plans/<name>.md), else null. */
const planNameOf = (message: ChatMessage): string | null => {
  if (!message.isToolUse || (message.toolName !== 'ExitPlanMode' && message.toolName !== 'exit_plan_mode')) {
    return null;
  }
  let input: unknown = message.toolInput;
  try {
    input = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return null;
  }
  const filePath = input && typeof input === 'object' ? (input as { planFilePath?: unknown }).planFilePath : undefined;
  const match = typeof filePath === 'string' ? /\/\.claude\/plans\/([A-Za-z0-9_-]+)\.md$/.exec(filePath) : null;
  return match ? match[1] : null;
};

/**
 * quests: like Cursor, a plan opens as its own tab, right after the tab of the chat that wrote it, in that chat's
 * pane, and is shown. Only plans written after the chat was opened here: plans already in its history (also
 * older pages loaded later) never pop up, and a plan tab that was closed stays closed.
 */
export function usePlanTabs(sessionId: string | null | undefined, chatMessages: ChatMessage[], isLoading: boolean) {
  const navigate = useNavigate();
  const openedRef = useRef<{ sessionId: string; since: number; opened: Set<string> } | null>(null);

  useEffect(() => {
    if (!sessionId || isLoading) {
      return;
    }
    if (openedRef.current?.sessionId !== sessionId) {
      openedRef.current = { sessionId, since: Date.now(), opened: new Set() };
    }
    const seen = openedRef.current;
    for (const message of chatMessages) {
      const plan = planNameOf(message);
      if (!plan || seen.opened.has(plan) || new Date(message.timestamp ?? 0).getTime() < seen.since) {
        continue;
      }
      seen.opened.add(plan);
      openTabAfter(planTabId(plan), isEmbedded ? 'right' : 'left', sessionId);
      if (!isEmbedded) {
        navigate(`/plan/${plan}`);
      }
    }
  }, [sessionId, chatMessages, isLoading, navigate]);
}
