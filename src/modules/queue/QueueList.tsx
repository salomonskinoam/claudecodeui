import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, Plus, SquareArrowOutUpRight, X } from 'lucide-react';

import { cn } from '@/shared/utils';
import { CHAT_DOT_STYLE, useChatDots } from '@/shared/hooks/useLiveChats';
import { openRightTab } from '@/shared/hooks/useSplitPane';

import CloseTicketDialog from '@/modules/queue/CloseTicketDialog';
import KindSign from '@/modules/queue/KindSign';
import { dragQueue, familyColors, previewQueue, setQueueHover, setQueueLatch, useQueue, useQueueHover } from '@/modules/queue/useQueue';
import type { QueueEntry } from '@/modules/queue/useQueue';
import { setQueueOpener } from '@/modules/queue/queueNavigation';

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
  const [preview, setPreview] = useState<string[] | null>(null);
  const [closing, setClosing] = useState<QueueEntry | null>(null);
  const dragged = useRef<string | null>(null);
  const target = useRef<string | null>(null);

  const byKey = new Map(queue.entries.map((e) => [e.key, e]));
  const colors = familyColors(queue.entries.map((e) => e.rootKey));
  const keys = (preview ?? queue.view).filter((k) => byKey.has(k));
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

  const beforeKeyAt = (event: DragEvent<HTMLDivElement>, key: string): string | null => {
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientY < box.top + box.height / 2) return key;
    const i = queue.order.indexOf(key);
    return queue.order.slice(i + 1).find((k) => k !== dragged.current) ?? null;
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>, key: string) => {
    if (!dragged.current || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    const before = beforeKeyAt(event, key);
    if (before === target.current) return;
    target.current = before;
    const moving = dragged.current;
    // The server computes the order (one copy of the rules); a stale answer for an older target is dropped.
    void previewQueue(moving, before).then((v) => { if (dragged.current === moving && target.current === before) setPreview(v); });
  };

  const endDrag = () => {
    dragged.current = null;
    target.current = null;
    setPreview(null);
  };

  return (
    <div className="flex flex-col" data-quests-queue="list">
      <button
        type="button"
        className="mx-2 mb-1 flex h-[26px] items-center gap-2 rounded-sm px-2 text-[13px] text-[#7f8081] hover:bg-[#2a2d2e]"
        onClick={onNewSession}
      >
        <Plus className="h-3 w-3" />
        New Session
      </button>
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
        {keys.map((key) => {
          const e = byKey.get(key)!;
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
              )}
              style={{ backgroundColor: colors.get(e.rootKey) }}
            >
              <span
                className={cn('h-2 w-2 flex-shrink-0 rounded-full', dot === 'running' && 'animate-pulse')}
                style={{ backgroundColor: dot ? CHAT_DOT_STYLE[dot].color : 'transparent' }}
              />
              <KindSign kind={e.kind} />
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
