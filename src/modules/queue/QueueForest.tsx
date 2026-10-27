import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { cn } from '@/shared/utils';
import { CHAT_DOT_STYLE, useChatDots } from '@/shared/hooks/useLiveChats';
import { useFamilyColors } from '@/modules/queue/familyColors';
import KindSign from '@/modules/queue/KindSign';
import { HOVER_CLASS, SHOWN_CLASS } from '@/modules/queue/looks';
import { setQueueHover, useQueueHover } from '@/modules/queue/queueHover';
import { openQueueEntry } from '@/modules/queue/queueNavigation';
import { useQueue } from '@/modules/queue/queueStore';
import { isChat, type QueueEntry } from '@/modules/queue/types';

/**
 * quests priority queue: the forest. Roots side by side in queue order, each family below its root, children
 * indented under their parent. A small button per node folds its children; hovering a node highlights its line
 * in the list and its tab (and the other way around); clicking opens it as its line does.
 */
export default function QueueForest({ shownSessionId }: { shownSessionId: string | null }) {
  const queue = useQueue();
  const hover = useQueueHover();
  const dots = useChatDots();
  const colors = useFamilyColors();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const rank = new Map(queue.view.map((k, i) => [k, i]));
  const byRank = (a: QueueEntry, b: QueueEntry) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0);
  const children = new Map<string, QueueEntry[]>();
  for (const e of queue.entries) {
    if (e.rootKey !== e.key && e.parentKey) children.set(e.parentKey, [...(children.get(e.parentKey) ?? []), e]);
  }
  const roots = queue.entries.filter((e) => e.rootKey === e.key).sort(byRank);

  const node = (e: QueueEntry, depth: number) => {
    const kids = (children.get(e.key) ?? []).sort(byRank);
    const dot = e.sessionId ? dots[e.sessionId] : undefined;
    const isFolded = folded.has(e.key);
    return (
      <div key={e.key} style={{ marginLeft: depth ? 10 : 0 }}>
        <div
          data-forest-key={e.key}
          title={e.chatName ?? e.title}
          onMouseEnter={() => setQueueHover(e.key)}
          onMouseLeave={() => setQueueHover(null)}
          onClick={() => openQueueEntry(e)}
          className={cn('mt-0.5 flex h-[20px] max-w-[150px] cursor-pointer items-center gap-1 rounded-sm px-1 text-[12px] text-[#cccccc]',
            isChat(e, shownSessionId) && SHOWN_CLASS,
            hover === e.key && HOVER_CLASS)}
          style={{ backgroundColor: colors.get(e.rootKey) }}
        >
          {kids.length > 0 ? (
            <button type="button" title={isFolded ? 'Open' : 'Fold'} className="flex-shrink-0 opacity-70 hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                setFolded((f) => { const n = new Set(f); if (n.has(e.key)) n.delete(e.key); else n.add(e.key); return n; });
              }}>
              {isFolded ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : <span className="w-3 flex-shrink-0" />}
          <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: dot ? CHAT_DOT_STYLE[dot].color : 'transparent' }} />
          <KindSign kind={e.kind} />
          <span className="truncate">{e.number !== null ? `#${e.number} ${e.title}` : e.title}</span>
        </div>
        {!isFolded && kids.map((k) => node(k, depth + 1))}
      </div>
    );
  };

  return (
    <div data-quests-queue="forest" className="mx-1 mb-2 max-h-[33vh] overflow-auto border-b border-[#454647] pb-2">
      <div className="flex w-max items-start gap-2">
        {roots.map((r) => node(r, 0))}
      </div>
    </div>
  );
}
