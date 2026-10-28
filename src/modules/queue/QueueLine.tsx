import type { MouseEvent } from 'react';
import { CircleCheck, Pin, SquareArrowOutUpRight } from 'lucide-react';

import { cn } from '@/shared/utils';
import EntryDot from '@/modules/queue/EntryDot';
import type { EntryLook } from '@/modules/queue/entryLook';
import EntryTitle from '@/modules/queue/EntryTitle';
import KindSign from '@/modules/queue/KindSign';
import { setQueueLatch } from '@/modules/queue/queueStore';
import type { QueueEntry } from '@/modules/queue/types';
import type { LineMarker } from '@/modules/queue/useLineDrag';

/** One of the three icon columns on the right of every line, 16 px wide, empty or not. */
const SLOT = 'flex w-4 flex-shrink-0 items-center justify-center';

type QueueLineProps = {
  entry: QueueEntry;
  look: EntryLook;
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
 * release button of the latched line, the Cursor link and the ticket's close button.
 */
export default function QueueLine({ entry: e, look, blinking, latched, separator, marker, drag, onOpen, onCloseTicket }: QueueLineProps) {
  return (
    <div
      data-queue-key={e.key}
      {...drag}
      onMouseEnter={look.onMouseEnter}
      onMouseLeave={look.onMouseLeave}
      onClick={onOpen}
      title={e.chatName ?? e.title}
      className={cn(
        'group relative mx-1 flex h-[26px] cursor-pointer items-center gap-2 rounded-sm px-2 text-[15px] text-[#cccccc]',
        look.shownClass,
        // The shown chat bulges 8 px to the left, past the list's edge; the text keeps its place.
        look.shown && '-ml-1 pl-4',
        look.hoverClass,
        blinking && 'animate-pulse',
        separator && 'mt-[7px] before:absolute before:-top-[5px] before:left-0 before:right-0 before:h-[2px] before:bg-[#8a8a8a]',
      )}
      style={{ backgroundColor: look.color }}
    >
      {marker?.key === e.key && (
        <span className={cn('pointer-events-none absolute left-0 right-0 z-10 h-[3px] rounded-full bg-[#3794ff]', marker.below ? '-bottom-[2px]' : '-top-[2px]')} />
      )}
      <EntryDot sessionId={e.sessionId} className="h-2 w-2" />
      <KindSign kind={e.kind} />
      <EntryTitle entry={e} className="min-w-0 flex-1 truncate" />
      {/* Three fixed columns on the right, the same on every line: the pin, the Cursor link, the ticket's close
          button. A column stays empty when the line has nothing for it, so the icons never shift sideways. */}
      <span className={SLOT}>
        {e.sessionId && (
          <button type="button" title={latched ? 'Unpin' : 'Pin on top'}
            className={cn('hover:opacity-100', latched ? 'opacity-100 text-[#3794ff]' : 'opacity-0 group-hover:opacity-70')}
            data-quests-pin={latched ? 'pinned' : 'pin'}
            onClick={(event) => { event.stopPropagation(); void setQueueLatch(latched ? null : e.key); }}>
            <Pin className={cn('h-3.5 w-3.5', latched && 'fill-current')} />
          </button>
        )}
      </span>
      <span className={SLOT}>
        {e.providerSessionId && (
          <a href={`cursor://anthropic.claude-code/open?session=${e.providerSessionId}`} title="Open in Cursor"
            className="opacity-0 group-hover:opacity-70" onClick={(event) => event.stopPropagation()}>
            <SquareArrowOutUpRight className="h-3 w-3" />
          </a>
        )}
      </span>
      <span className={SLOT}>
        {e.number !== null && (
          <button type="button" title="Close the ticket" className="opacity-0 group-hover:opacity-70"
            onClick={(event) => { event.stopPropagation(); onCloseTicket(); }}>
            <CircleCheck className="h-3 w-3" />
          </button>
        )}
      </span>
    </div>
  );
}
