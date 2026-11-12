import { GRAY, useChatLook } from '@/modules/queue/entryLook';
import { useQueueNames } from '@/modules/queue/queueStore';

/**
 * quests (requirement 121): the shown chat's color and full name, so Noam knows which chat he talks to. The color
 * is the one its line and its tab wear (familyColors.ts); a chat outside the queue is gray. Noam, 12 Nov: "i want
 * the left side of the screen to be narrowly painted with the color of the current chat as well as a small
 * unimportant part of the chat box" and "the full chat name should always be in all these colored spaces".
 */
function useChatColor(sessionId: string): string {
  const color = useChatLook()(sessionId)?.color;
  return color && color !== 'transparent' ? color : GRAY;
}

/** The strip at the left edge of a pane: the name runs bottom to top, like a book's spine. */
export function ChatColorStrip({ sessionId, name }: { sessionId: string; name: string }) {
  return (
    <div
      className="flex min-w-5 flex-shrink-0 rotate-180 items-center justify-center px-0.5 text-xs font-semibold text-white [writing-mode:vertical-rl]"
      style={{ background: useChatColor(sessionId) }}
      title={name}
    >
      {name}
    </div>
  );
}

/**
 * The badge at the left end of the input box's bottom row, before the token count (Noam, 12 Nov: "move it to not
 * hide where i write" and "the name badge should be the leftbost instead of where the 730k is"); the queue's name
 * first, as the tabs do.
 */
export function ChatNameTab({ sessionId, fallbackName }: { sessionId: string; fallbackName: string }) {
  const name = useQueueNames()[sessionId] ?? fallbackName;
  return (
    <div
      className="flex-shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] leading-[16px] font-semibold text-white"
      style={{ background: useChatColor(sessionId) }}
    >
      {name}
    </div>
  );
}
