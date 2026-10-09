import { memo, useState } from 'react';
import type { DragEvent } from 'react';

import { type ChatDot, CHAT_DOT_STYLE } from '@/shared/hooks/useLiveChats';
import { cn } from '@/shared/utils';

/** The drag payload type: a tab id, so drops from outside the tab rows are ignored. */
const TAB_DRAG_TYPE = 'application/x-quests-tab';

type PaneTabsProps = {
  ids: string[];
  activeId: string | null;
  nameOf: (id: string) => string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Closes the whole pane; shown at the right end of the row when given. */
  onClosePane?: () => void;
  dotOf: (id: string) => ChatDot | null;
  /** A tab (from this row or the other pane's) was dropped here, before `beforeId` (null: at the end). */
  onDropTab: (id: string, beforeId: string | null) => void;
};

/**
 * quests: one row of chat tabs above a pane, like an editor's tab bar. Tabs drag: onto a tab (left half:
 * before it, right half: after it) or onto the empty end of a row, in this pane or the other one.
 */
function PaneTabs({ ids, activeId, nameOf, onSelect, onClose, onClosePane, dotOf, onDropTab }: PaneTabsProps) {
  // Where a dragged tab would land: before this id, or null for the end of the row; undefined while no drag.
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);

  const targetOf = (event: DragEvent<HTMLElement>, id: string): string | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left + rect.width / 2) {
      return id;
    }
    return ids[ids.indexOf(id) + 1] ?? null;
  };
  const allowDrop = (event: DragEvent<HTMLElement>, before: string | null) => {
    if (!event.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDropBefore(before);
  };
  const drop = (event: DragEvent<HTMLElement>, before: string | null) => {
    const id = event.dataTransfer.getData(TAB_DRAG_TYPE);
    setDropBefore(undefined);
    if (!id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (id !== before) {
      onDropTab(id, before);
    }
  };

  return (
    <div
      className={cn(
        'flex h-9 flex-shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/30',
        dropBefore === null && 'shadow-[inset_-2px_0_0_0_#3794ff]',
      )}
      onDragOver={(event) => allowDrop(event, null)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropBefore(undefined);
        }
      }}
      onDrop={(event) => drop(event, null)}
    >
      {ids.map((id) => {
        const dot = dotOf(id);
        return (
          <div
            key={id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(TAB_DRAG_TYPE, id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDropBefore(undefined)}
            onDragOver={(event) => allowDrop(event, targetOf(event, id))}
            onDrop={(event) => drop(event, targetOf(event, id))}
            className={cn(
              'group flex min-w-0 max-w-[220px] cursor-pointer items-center gap-1 border-r border-border/60 pl-3 pr-1 text-sm',
              // Cursor's tab colors (workbench.colorCustomizations: tab.activeBackground, tab.activeBorder).
              id === activeId
                ? 'border-b-2 border-b-[#ff0000] bg-[#3d5984] text-white'
                : 'text-[#dddddd] hover:bg-muted/50',
              // The landing spot of a dragged tab: a blue line on this tab's left edge.
              dropBefore === id && 'shadow-[inset_2px_0_0_0_#3794ff]',
            )}
            title={nameOf(id)}
            onClick={() => onSelect(id)}
            onAuxClick={(event) => event.button === 1 && onClose(id)}
          >
            {dot && (
              <span
                title={CHAT_DOT_STYLE[dot].label}
                className={cn('h-2 w-2 flex-shrink-0 rounded-full', dot === 'running' && 'animate-pulse')}
                style={{ backgroundColor: CHAT_DOT_STYLE[dot].color }}
              />
            )}
            <span className="truncate">{nameOf(id)}</span>
            <button
              type="button"
              title="Close tab"
              className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:bg-muted',
                id === activeId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
              onClick={(event) => {
                event.stopPropagation();
                onClose(id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      {onClosePane && (
        <button
          type="button"
          title="Close the right pane"
          className="ml-auto flex w-9 flex-shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClosePane}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default memo(PaneTabs);
