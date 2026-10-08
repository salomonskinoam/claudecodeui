import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useParams } from 'react-router-dom';

import ProjectEffects from '@/modules/project-workspace/controllers/ProjectEffects';
import type { ProjectWorkspaceShellProps } from '@/shared/types';
import { useProjectSidebarState } from '@/modules/project-workspace/context/ProjectsStateContext';
import PaneTabs from '@/modules/project-workspace/PaneTabs';
import ProjectCommandPalette from '@/modules/project-workspace/ProjectCommandPalette';
import ProjectMainRegion from '@/modules/project-workspace/ProjectMainRegion';
import ProjectQuickSettingsRegion from '@/modules/project-workspace/ProjectQuickSettingsRegion';
import ProjectSidebarRegion from '@/modules/project-workspace/ProjectSidebarRegion';
import {
  closeLeftTab,
  closeRightPane,
  closeRightTab,
  isEmbedded,
  neighbor,
  openLeftTab,
  selectRightTab,
  usePanes,
} from '@/shared/hooks/useSplitPane';

/** Rendered by ProjectWorkspaceRoute to lay out the workspace sidebar, main region and global overlays. */
function ProjectWorkspaceShell({
  isMobile,
  ws,
  sendMessage,
  navigate,
}: ProjectWorkspaceShellProps) {
  // quests: chat tabs per pane and the split screen (see useSplitPane).
  const { sessionId } = useParams<{ sessionId?: string }>();
  const panes = usePanes();
  const { projects } = useProjectSidebarState().sidebarSharedProps;
  const showTabs = !isEmbedded && !isMobile;
  const showSplit = showTabs && panes.rightActive !== null;

  useEffect(() => {
    if (showTabs && sessionId) {
      openLeftTab(sessionId);
    }
  }, [showTabs, sessionId]);

  const nameOf = useCallback((id: string) => {
    for (const project of projects) {
      const session = project.sessions?.find((s) => s.id === id);
      if (session) {
        return String(session.summary || session.name || 'New chat');
      }
    }
    return `chat ${id.slice(0, 8)}`;
  }, [projects]);

  // The bar between the panes drags; the left pane's share of the width (percent) is remembered.
  // While dragging, the iframe ignores the pointer so it cannot swallow the drag.
  const panesRef = useRef<HTMLDivElement>(null);
  const [splitPercent, setSplitPercent] = useState(() => {
    try {
      return Number(localStorage.getItem('quests-split-percent')) || 50;
    } catch {
      return 50;
    }
  });
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const dragSplit = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || !panesRef.current) {
      return;
    }
    const rect = panesRef.current.getBoundingClientRect();
    setSplitPercent(Math.min(85, Math.max(15, ((event.clientX - rect.left) / rect.width) * 100)));
  };
  const endDragSplit = () => {
    setIsDraggingSplit(false);
    try {
      localStorage.setItem('quests-split-percent', String(splitPercent));
    } catch {
      // Storage blocked: the width resets on reload.
    }
  };

  const closeLeft = useCallback((id: string) => {
    if (id === sessionId) {
      const next = neighbor(panes.left, id);
      navigate(next ? `/session/${next}` : '/');
    }
    closeLeftTab(id);
  }, [sessionId, panes.left, navigate]);

  return (
    <div
      className="fixed inset-0 flex bg-background"
      style={{ bottom: 'var(--keyboard-height, 0px)' }}
    >
      <ProjectEffects navigate={navigate} />

      <div ref={panesRef} className="flex min-w-0 flex-1">
        <div
          className={showSplit ? 'flex min-w-0 flex-col' : 'flex min-w-0 flex-1 flex-col'}
          style={showSplit ? { flex: `0 0 ${splitPercent}%` } : undefined}
        >
          {showTabs && panes.left.length > 0 && (
            <PaneTabs
              ids={panes.left}
              activeId={sessionId ?? null}
              nameOf={nameOf}
              onSelect={(id) => navigate(`/session/${id}`)}
              onClose={closeLeft}
            />
          )}
          <ProjectMainRegion
            isMobile={isMobile}
            ws={ws}
            sendMessage={sendMessage}
            navigate={navigate}
          />
        </div>
  
        {showSplit && panes.rightActive && (
          <div
            title="Drag to resize the panes"
            className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/60 ${isDraggingSplit ? 'bg-primary/60' : 'bg-primary/30'}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsDraggingSplit(true);
            }}
            onPointerMove={dragSplit}
            onPointerUp={endDragSplit}
            onPointerCancel={endDragSplit}
          />
        )}
  
        {showSplit && panes.rightActive && (
          <div className="flex min-w-0 flex-1 flex-col">
            <PaneTabs
              ids={panes.right}
              activeId={panes.rightActive}
              nameOf={nameOf}
              onSelect={selectRightTab}
              onClose={closeRightTab}
              onClosePane={closeRightPane}
            />
            {panes.rightActive === sessionId ? (
              // Two copies of the app writing one chat would clash, so the right pane steps aside.
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                This chat is open in the left pane.
              </div>
            ) : (
              // ponytail: switching a right tab reloads the iframe; keep one iframe per tab if that is slow.
              <iframe
                key={panes.rightActive}
                title="Right pane"
                src={`/session/${panes.rightActive}`}
                className="w-full flex-1 border-0"
                style={isDraggingSplit ? { pointerEvents: 'none' } : undefined}
              />
            )}
          </div>
        )}
      </div>

      <ProjectCommandPalette />
      {/* Last flex child on purpose: when pinned it docks to the right of the main region. */}
      <ProjectQuickSettingsRegion />
      {/* quests: the session list sits on the right. */}
      {!isEmbedded && <ProjectSidebarRegion isMobile={isMobile} />}
    </div>
  );
}

export default memo(ProjectWorkspaceShell);
