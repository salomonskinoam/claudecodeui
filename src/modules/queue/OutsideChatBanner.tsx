import { openNextInQueue } from '@/modules/queue/queueNavigation';
import { useQueue } from '@/modules/queue/useQueue';

const btn = 'rounded-sm border border-[#454647] px-3 py-1 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]';

/**
 * quests priority queue: a chat open in another editor (Cursor, the Claude desktop app, a terminal) is read-only
 * here, since two processes on one transcript break a chat. Shown in place of the input box.
 */
export default function OutsideChatBanner({ sessionId, children }: { sessionId: string | null; children: React.ReactNode }) {
  const queue = useQueue();
  const entry = sessionId ? queue.entries.find((e) => e.sessionId === sessionId) : undefined;
  if (!entry?.heldOutside) return <>{children}</>;
  return (
    <div className="mx-8 mb-4 flex items-center justify-between gap-3 rounded border border-[#575757] bg-[#3c3c3c] px-4 py-2 text-[13px] text-[#cccccc]"
      data-quests-queue="outside">
      <span>This chat is open in another editor. Answer it there.</span>
      <span className="flex gap-2">
        <a className={btn} href={`cursor://anthropic.claude-code/open?session=${entry.providerSessionId}`}>Open in Cursor to answer</a>
        <button type="button" className={btn} onClick={() => openNextInQueue()}>Next</button>
      </span>
    </div>
  );
}
