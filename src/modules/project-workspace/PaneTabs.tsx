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
};

/** quests: one row of chat tabs above a pane, like an editor's tab bar. */
function PaneTabs({ ids, activeId, nameOf, onSelect, onClose, onClosePane }: PaneTabsProps) {
  return (
    <div className="flex h-9 flex-shrink-0 items-stretch overflow-x-auto border-b border-border bg-muted/30">
      {ids.map((id) => (
        <div
          key={id}
          className={cn(
            'group flex min-w-0 max-w-[220px] cursor-pointer items-center gap-1 border-r border-border/60 pl-3 pr-1 text-sm',
            id === activeId
              ? 'border-t-2 border-t-primary bg-background text-foreground'
              : 'text-muted-foreground hover:bg-muted/50',
          )}
          title={nameOf(id)}
          onClick={() => onSelect(id)}
          onAuxClick={(event) => event.button === 1 && onClose(id)}
        >
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
      ))}
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
