import type { MouseEvent } from 'react';
import { Archive, CircleCheck, ListEnd, Pause, Pencil, Pin, SquareArrowOutUpRight } from 'lucide-react';

import { cn } from '@/shared/utils';
import EntryDot from '@/modules/queue/EntryDot';
import type { EntryLook } from '@/modules/queue/entryLook';
import EntryTitle from '@/modules/queue/EntryTitle';
import KindSign from '@/modules/queue/KindSign';
import { setQueueLatch } from '@/modules/queue/queueStore';
import { PLACES, type QueueEntry, type Where } from '@/modules/queue/types';
import type { LineMarker } from '@/modules/queue/useLineDrag';

/** One of the three icon columns on the right of every line, 16 px wide, empty or not. */
// quests: each icon column is a 28 px square, the icons 16 px, faint until the line is hovered (Noam, 3 Nov: "make the
// hoverable area and buttons larger on the list items, they are too small").
const SLOT = 'flex h-7 w-7 flex-shrink-0 items-center justify-center';
const BUTTON = 'flex h-7 w-7 items-center justify-center rounded opacity-25 hover:bg-white/10 hover:opacity-100 group-hover:opacity-80';

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
  /** A drawer button: the entry goes to that place (the queue: at its end). Not a toggle. */
  onPlace: (where: Where) => void;
  /** A right-click: the chat's menu (rename, pin, on hold, ...). */
  onMenu?: (event: MouseEvent) => void;
  /** The pencil: rename the chat. */
  onRename?: () => void;
};

/**
 * quests priority queue: one line of the list. The chat's dot, the kind's sign, the title, and on the right five
 * icon columns: the pin, send to the end, on hold (the pause), archive, the Cursor link, the ticket's close button.
 */
const ICONS: Record<Where, typeof Archive> = { queue: ListEnd, hold: Pause, archive: Archive };

export default function QueueLine({ entry: e, look, blinking, latched, separator, marker, drag, onOpen, onCloseTicket, onPlace, onMenu, onRename }: QueueLineProps) {
  return (
    <div
      data-queue-key={e.key}
      data-session-id={e.sessionId ?? undefined}
      {...drag}
      onMouseEnter={look.onMouseEnter}
      onMouseLeave={look.onMouseLeave}
      onClick={onOpen}
      onContextMenu={onMenu}
      title={e.title}
      className={cn(
        'group relative mx-1 flex h-[32px] cursor-pointer items-center gap-1 rounded-sm px-2 text-[15px] text-[#cccccc]',
        look.shownClass,
        // The shown chat bulges 12 px to the left, past the list's edge; the text keeps its place.
        look.shown && '-ml-2 pl-5',
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
      {/* Six fixed columns on the right, the same on every line: rename (the pencil), the pin, send to the end,
          on hold (the pause), archive, the Cursor link, the ticket's close button. A column stays empty when the line has
          nothing for it, so the icons never shift sideways. */}
      <span className={SLOT}>
        {e.sessionId && onRename && (
          <button type="button" title="Rename" className={BUTTON}
            data-quests-line="rename" onClick={(event) => { event.stopPropagation(); onRename(); }}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </span>
      <span className={SLOT}>
        {e.sessionId && (
          <button type="button" title={latched ? 'Unpin' : 'Pin on top'}
            className={cn(BUTTON, latched && 'opacity-100 text-[#3794ff]')}
            data-quests-pin={latched ? 'pinned' : 'pin'}
            onClick={(event) => { event.stopPropagation(); void setQueueLatch(latched ? null : e.key); }}>
            <Pin className={cn('h-4 w-4', latched && 'fill-current')} />
          </button>
        )}
      </span>
      {PLACES.map(({ where, label }) => {
        const Icon = ICONS[where];
        // The button of the place the entry is in now is lit; the queue's button still moves it to the end.
        const here = e.placement === where && where !== 'queue';
        return (
          <span key={where} className={SLOT}>
            <button type="button" title={here ? `${label}: here now` : label} className={cn(BUTTON, here && 'opacity-100 text-[#3794ff]')}
              data-quests-place={where} data-quests-here={here ? 'true' : undefined}
              onClick={(event) => { event.stopPropagation(); onPlace(where); }}>
              <Icon className="h-4 w-4" />
            </button>
          </span>
        );
      })}
      <span className={SLOT}>
        {e.providerSessionId && (
          <a href={`cursor://anthropic.claude-code/open?session=${e.providerSessionId}`} title="Open in Cursor"
            className={BUTTON} onClick={(event) => event.stopPropagation()}>
            <SquareArrowOutUpRight className="h-4 w-4" />
          </a>
        )}
      </span>
      <span className={SLOT}>
        {e.number !== null && (
          <button type="button" title="Close the ticket" className={BUTTON}
            onClick={(event) => { event.stopPropagation(); onCloseTicket(); }}>
            <CircleCheck className="h-4 w-4" />
          </button>
        )}
      </span>
    </div>
  );
}
