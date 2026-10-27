import type { MouseEvent } from 'react';
import { CircleCheck, SquareArrowOutUpRight, X } from 'lucide-react';

import { cn } from '@/shared/utils';
import { CHAT_DOT_STYLE, useChatDots } from '@/shared/hooks/useLiveChats';
import KindSign from '@/modules/queue/KindSign';
import { HOVER_CLASS, setQueueHover, useQueueHover } from '@/modules/queue/queueHover';
import { setQueueLatch } from '@/modules/queue/queueStore';
import type { QueueEntry } from '@/modules/queue/types';
import type { LineMarker } from '@/modules/queue/useLineDrag';

type QueueLineProps = {
  entry: QueueEntry;
  color: string | undefined;
  shown: boolean;
  blinking: boolean;
  latched: boolean;
  /** A separator above this line: it opens a new group of the list. */
  separator: boolean;
  /** The landing line of a drag, when this line is under the mouse. */
  marker: LineMarker | null;
  /** Drag handlers from useLineDrag. */
  drag: Record<string, unknown>;
  onOpen: (event: MouseEvent) => void;
  onCloseTicket: () => void;
};

/**
 * quests priority queue: one line of the list. The chat's dot, the kind's sign, the title, and on the right the
 * release button of the latched line, the Cursor link, the ticket's GitHub link and its close button.
 */
export default function QueueLine({ entry: e, color, shown, blinking, latched, separator, marker, drag, onOpen, onCloseTicket }: QueueLineProps) {
  const dots = useChatDots();
  const dot = e.sessionId ? dots[e.sessionId] : undefined;
  const hovered = useQueueHover() === e.key;
  return (
    <div
      data-queue-key={e.key}
      {...drag}
      onMouseEnter={() => setQueueHover(e.key)}
      onMouseLeave={() => setQueueHover(null)}
      onClick={onOpen}
      title={e.chatName ?? e.title}
      className={cn(
        'group relative mx-1 flex h-[26px] cursor-pointer items-center gap-2 rounded-sm px-2 text-[15px] text-[#cccccc]',
        shown && 'outline outline-1 outline-[#3794ff]',
        hovered && HOVER_CLASS,
        blinking && 'animate-pulse',
        separator && 'mt-[7px] before:absolute before:-top-[5px] before:left-0 before:right-0 before:h-[2px] before:bg-[#8a8a8a]',
      )}
      style={{ backgroundColor: color }}
    >
      {marker?.key === e.key && (
        <span className={cn('pointer-events-none absolute left-0 right-0 z-10 h-[3px] rounded-full bg-[#3794ff]', marker.below ? '-bottom-[2px]' : '-top-[2px]')} />
      )}
      <span
        className={cn('h-2 w-2 flex-shrink-0 rounded-full', dot === 'running' && 'animate-pulse')}
        style={{ backgroundColor: dot ? CHAT_DOT_STYLE[dot].color : 'transparent' }}
      />
      <KindSign kind={e.kind} />
      <span className="min-w-0 flex-1 truncate">{e.title}</span>
      {latched && (
        <button type="button" title="Release from the top" className="opacity-70 hover:opacity-100"
          onClick={(event) => { event.stopPropagation(); void setQueueLatch(null); }}>
          <X className="h-3 w-3" />
        </button>
      )}
      {e.providerSessionId && (
        <a href={`cursor://anthropic.claude-code/open?session=${e.providerSessionId}`} title="Open in Cursor"
          className="opacity-0 group-hover:opacity-70" onClick={(event) => event.stopPropagation()}>
          <SquareArrowOutUpRight className="h-3 w-3" />
        </a>
      )}
      {e.url && (
        <a href={e.url} target="_blank" rel="noreferrer" title={`Ticket #${e.number} on GitHub`}
          className="text-[12px] text-[#828283] hover:text-[#3794ff]" onClick={(event) => event.stopPropagation()}>
          #{e.number}
        </a>
      )}
      {e.number !== null && (
        <button type="button" title="Close the ticket" className="opacity-0 group-hover:opacity-70"
          onClick={(event) => { event.stopPropagation(); onCloseTicket(); }}>
          <CircleCheck className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
