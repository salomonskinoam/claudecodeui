import ChatDotMark from '@/shared/hooks/ChatDotMark';
import { useChatDots } from '@/shared/hooks/useLiveChats';
import { cn } from '@/shared/utils';

/**
 * quests priority queue: the status dot of an entry's chat (the same dot the tabs show), in the entry's slot so
 * every name starts at the same place; an entry without a chat, or a chat with nothing to show, has an empty slot.
 */
export default function EntryDot({ sessionId, className }: { sessionId: string | null; className: string }) {
  const dots = useChatDots();
  const dot = sessionId ? dots[sessionId] : undefined;
  return dot ? <ChatDotMark dot={dot} className={className} /> : <span className={cn('flex-shrink-0', className)} />;
}
