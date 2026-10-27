import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, Plus, RefreshCw, SquareArrowOutUpRight, X } from 'lucide-react';

import { cn } from '@/shared/utils';
import { CHAT_DOT_STYLE, useChatDots } from '@/shared/hooks/useLiveChats';
import { openRightTab } from '@/shared/hooks/useSplitPane';

import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import KindSign from '@/modules/queue/KindSign';
import {
  dragQueue, familyColors, setQueueHover, setQueueLatch, useQueue, useQueueHover,
} from '@/modules/queue/useQueue';
import type { QueueEntry } from '@/modules/queue/useQueue';
import { setQueueOpener, syncTabsFromCursor } from '@/modules/queue/queueNavigation';

const DRAG_TYPE = 'application/x-quests-queue';

type QueueListProps = {
  /** The page's session id of the chat on screen in the left pane. */
  shownSessionId: string | null;
  onNewSession: () => void;
  /** Start a new chat for a ticket that no chat has claimed; the chat asks for its own name at its start. */
  onStartTicket: (entry: QueueEntry) => void;
};

/** Opens an entry's chat as a left-pane tab (Ctrl/Cmd: right pane); an unclaimed ticket starts a new chat. */
export function useOpenEntry(onStartTicket: (entry: QueueEntry) => void) {
  const navigate = useNavigate();
  return (entry: QueueEntry, event?: MouseEvent) => {
    if (!entry.sessionId) {
      onStartTicket(entry);
      return;
    }
    if (event && (event.metaKey || event.ctrlKey)) openRightTab(entry.sessionId);
    else navigate(`/session/${entry.sessionId}`);
  };
}

/**
 * quests priority queue: the session list as one flat list in queue order, top first. One background color per
 * family; root lines drag (the family block grows as rules require); a line ranked above the shown chat blinks
 * when it becomes ready for the user.
 */
export default function QueueList({ shownSessionId, onNewSession, onStartTicket }: QueueListProps) {
  const queue = useQueue();
  const hover = useQueueHover();
  const dots = useChatDots();
  const open = useOpenEntry(onStartTicket);
  useEffect(() => setQueueOpener(open));
  // While a line is dragged, the list stays still; a blue line shows where it will land (`marker`: above or below
  // the line under the mouse).
  const [marker, setMarker] = useState<{ key: string; below: boolean } | null>(null);
  const [closing, setClosing] = useState<QueueEntry | null>(null);
  const dragged = useRef<string | null>(null);
  const target = useRef<string | null>(null);

  const byKey = new Map(queue.entries.map((e) => [e.key, e]));
  const colors = familyColors(queue);
  const keys = queue.view.filter((k) => byKey.has(k));
  const shownIndex = keys.findIndex((k) => byKey.get(k)!.sessionId === shownSessionId);

  // Blink: an entry above the shown chat that turned ready for the user, until it is opened or no longer ready.
  const wasReady = useRef(new Map<string, boolean>());
  const [blinking, setBlinking] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    queue.view.forEach((k, i) => {
      const e = byKey.get(k);
      if (!e) return;
      const turned = e.needsNoam && wasReady.current.get(k) === false;
      if (e.needsNoam && e.sessionId !== shownSessionId && (blinking.has(k) || turned) && (shownIndex < 0 || i < shownIndex)) next.add(k);
      wasReady.current.set(k, e.needsNoam);
    });
    if ([...next].join() !== [...blinking].join()) setBlinking(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, shownSessionId]);

  const onDragOver = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (!dragged.current || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const below = event.clientY >= box.top + box.height / 2;
    if (marker?.key === key && marker.below === below) return;
    setMarker({ key, below });
    // The drop sends "stand before this key" in the stored order; the server applies the family rules.
    const i = queue.order.indexOf(key);
    target.current = below ? (queue.order.slice(i + 1).find((k) => k !== dragged.current) ?? null) : key;
  };

  const endDrag = () => {
    dragged.current = null;
    target.current = null;
    setMarker(null);
  };

  return (
    <div className="flex flex-col" data-quests-queue="list">
      {[
        { label: 'New Session', icon: Plus, onClick: onNewSession, id: 'new-session', title: 'A new empty chat' },
        {
          label: 'Sync from Cursor', icon: RefreshCw, onClick: () => void syncTabsFromCursor(), id: 'sync-cursor',
          title: "The chats open in Cursor go on top of the queue and become this page's tabs",
        },
      ].map(({ label, icon: Icon, onClick, id, title }) => (
        <button
          key={id}
          type="button"
          data-quests-queue={id}
          title={title}
          className="mx-2 flex h-[26px] items-center gap-2 whitespace-nowrap rounded-sm px-2 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e]"
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          {label}
        </button>
      ))}
      <div className="mb-1" />
      <div
        onDragOver={(event) => { if (dragged.current) event.preventDefault(); }}
        onDrop={(event) => {
          event.preventDefault();
          const key = dragged.current;
          const before = target.current;
          endDrag();
          if (key) void dragQueue(key, before);
        }}
      >
        {keys.map((key, i) => {
          const e = byKey.get(key)!;
          // The separator: above it the chats open right now, below it the rest.
          const separator = i > 0 && byKey.get(keys[i - 1])!.open && !e.open;
          const dot = e.sessionId ? dots[e.sessionId] : undefined;
          const isRoot = e.rootKey === e.key && e.state !== 'permission';
          const isShown = e.sessionId !== null && e.sessionId === shownSessionId;
          return (
            <div
              key={key}
              data-queue-key={key}
              draggable={isRoot}
              onDragStart={(event) => {
                dragged.current = key;
                event.dataTransfer.setData(DRAG_TYPE, key);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => onDragOver(event, key)}
              onDragEnd={endDrag}
              onMouseEnter={() => setQueueHover(key)}
              onMouseLeave={() => setQueueHover(null)}
              onClick={(event) => open(e, event)}
              title={e.chatName ?? e.title}
              className={cn(
                'group relative mx-1 flex h-[26px] cursor-pointer items-center gap-2 rounded-sm px-2 text-[15px] text-[#cccccc]',
                isShown && 'outline outline-1 outline-[#3794ff]',
                hover === key && 'ring-1 ring-inset ring-white/80 brightness-150',
                blinking.has(key) && 'animate-pulse',
                separator && 'mt-[7px] before:absolute before:-top-[5px] before:left-0 before:right-0 before:h-[2px] before:bg-[#8a8a8a]',
              )}
              style={{ backgroundColor: colors.get(e.rootKey) }}
            >
              {marker?.key === key && (
                <span className={cn('pointer-events-none absolute left-0 right-0 z-10 h-[3px] rounded-full bg-[#3794ff]',
                  marker.below ? '-bottom-[2px]' : '-top-[2px]')} />
              )}
              <span
                className={cn('h-2 w-2 flex-shrink-0 rounded-full', dot === 'running' && 'animate-pulse')}
                style={{ backgroundColor: dot ? CHAT_DOT_STYLE[dot].color : 'transparent' }}
              />
              {/* A chat with no ticket keeps the sign's slot, so no line looks indented under another. */}
              {e.kind === 'chat' ? <span className="w-3 flex-shrink-0" /> : <KindSign kind={e.kind} />}
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              {queue.latch === key && (
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
                  onClick={(event) => { event.stopPropagation(); setClosing(e); }}>
                  <CircleCheck className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {closing && <CloseTicketDialog entry={closing} entries={queue.entries} onDone={() => setClosing(null)} />}
    </div>
  );
}
