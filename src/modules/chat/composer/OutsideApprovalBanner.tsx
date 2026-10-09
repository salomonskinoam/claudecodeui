import { memo } from 'react';
import { ShieldAlertIcon } from 'lucide-react';

import { useChatDots } from '@/shared/hooks/useLiveChats';
import type { ChatMessage } from '@/shared/types';
import { formatToolInputForDisplay } from '@/modules/chat/utils/chatPermissions';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/modules/chat/composer/Confirmation';

type OutsideApprovalBannerProps = {
  sessionId: string | null | undefined;
  chatMessages: ChatMessage[];
  /** True when this page itself runs the chat: its approval prompts then show in PermissionRequestsBanner. */
  runsHere: boolean;
};

/**
 * quests: the same "Permission required" popup as PermissionRequestsBanner (same Confirmation parts), for a chat
 * running in Cursor or a terminal. Its approval prompt lives in that process, which the page cannot answer, so
 * the one action brings the chat's Cursor tab to the front instead of Allow / Deny.
 */
function OutsideApprovalBanner({ sessionId, chatMessages, runsHere }: OutsideApprovalBannerProps) {
  const dots = useChatDots();
  if (!sessionId || runsHere || dots[sessionId] !== 'waiting') {
    return null;
  }
  const pending = [...chatMessages].reverse().find((message) => message.isToolUse && !message.toolResult);
  return (
    <div className="mb-3 space-y-2 px-8">
      <Confirmation approval="pending">
        <ConfirmationTitle className="flex items-start gap-3">
          <ShieldAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <ConfirmationRequest>
            <div>
              <span className="font-medium text-foreground">Permission required in Cursor</span>
              {pending?.toolName && (
                <span className="ml-2 text-muted-foreground">
                  Tool: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{pending.toolName}</code>
                </span>
              )}
            </div>
          </ConfirmationRequest>
        </ConfirmationTitle>
        {pending && (
          <details className="mt-2" open>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Tool input
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">
              {formatToolInputForDisplay(pending.toolInput)}
            </pre>
          </details>
        )}
        <ConfirmationActions>
          <ConfirmationAction
            variant="outline"
            onClick={() => {
              window.location.href = `cursor://anthropic.claude-code/open?session=${sessionId}`;
            }}
          >
            Open in Cursor to answer
          </ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </div>
  );
}

export default memo(OutsideApprovalBanner);
