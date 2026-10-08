import { memo } from 'react';

import { cn } from '@/shared/utils';

type PaneTabsProps = {
  ids: string[];
  activeId: string | null;
  nameOf: (id: string) => string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** Closes the whole pane; shown at the right end of the row when given. */
  onClosePane?: () => void;
  dotOf: (id: string) => TabDot | null;
};

/** The dot before a tab's name. */
export type TabDot = 'waiting' | 'running' | 'done';

// Blue and orange are the Claude Code extension's own tab dots (resources/claude-logo-pending.svg, claude-logo-done.svg);
// green is its timeline "success" dot.
const DOT: Record<TabDot, { color: string; label: string }> = {
  waiting: { color: '#3B82F6', label: 'Waiting for you' },
  running: { color: '#74c991', label: 'Running' },
  done: { color: '#D97757', label: 'Finished, not seen yet' },
};

/** quests: one row of chat tabs above a pane, like an editor's tab bar. */
function PaneTabs({ ids, activeId, nameOf, onSelect, onClose, onClosePane, dotOf }: PaneTabsProps) {
  return (
    <div className="flex h-9 flex-shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/30">
      {ids.map((id) => {
        const dot = dotOf(id);
        return (
          <div
            key={id}
            className={cn(
              'group flex min-w-0 max-w-[220px] cursor-pointer items-center gap-1 border-r border-border/60 pl-3 pr-1 text-sm',
              // Cursor's tab colors (workbench.colorCustomizations: tab.activeBackground, tab.activeBorder).
              id === activeId
                ? 'border-b-2 border-b-[#ff0000] bg-[#3d5984] text-white'
                : 'text-[#dddddd] hover:bg-muted/50',
            )}
            title={nameOf(id)}
            onClick={() => onSelect(id)}
            onAuxClick={(event) => event.button === 1 && onClose(id)}
          >
            {dot && (
              <span
                title={DOT[dot].label}
                className={cn('h-2 w-2 flex-shrink-0 rounded-full', dot === 'running' && 'animate-pulse')}
                style={{ backgroundColor: DOT[dot].color }}
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
