import { memo } from 'react';
import { useParams } from 'react-router-dom';

import ProjectEffects from '@/modules/project-workspace/controllers/ProjectEffects';
import type { ProjectWorkspaceShellProps } from '@/shared/types';
import ProjectCommandPalette from '@/modules/project-workspace/ProjectCommandPalette';
import ProjectMainRegion from '@/modules/project-workspace/ProjectMainRegion';
import ProjectQuickSettingsRegion from '@/modules/project-workspace/ProjectQuickSettingsRegion';
import ProjectSidebarRegion from '@/modules/project-workspace/ProjectSidebarRegion';
import { isEmbedded, setSplitSessionId, useSplitSessionId } from '@/shared/hooks/useSplitPane';

/** Rendered by ProjectWorkspaceRoute to lay out the workspace sidebar, main region and global overlays. */
function ProjectWorkspaceShell({
  isMobile,
  ws,
  sendMessage,
  navigate,
}: ProjectWorkspaceShellProps) {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const splitSessionId = useSplitSessionId();
  // quests: the right pane never repeats the left one, and the right pane never splits again.
  const showSplit = !isEmbedded && !isMobile && splitSessionId !== null && splitSessionId !== sessionId;

  return (
    <div
      className="fixed inset-0 flex bg-background"
      style={{ bottom: 'var(--keyboard-height, 0px)' }}
    >
      <ProjectEffects navigate={navigate} />
      {!isEmbedded && <ProjectSidebarRegion isMobile={isMobile} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <ProjectMainRegion
          isMobile={isMobile}
          ws={ws}
          sendMessage={sendMessage}
          navigate={navigate}
        />
      </div>

      {showSplit && (
        <div className="relative flex min-w-0 flex-1 flex-col border-l-2 border-primary/40">
          <iframe key={splitSessionId} title="Right pane" src={`/session/${splitSessionId}`} className="h-full w-full border-0" />
          <button
            type="button"
            title="Close the right pane"
            onClick={() => setSplitSessionId(null)}
            className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          >
            ×
          </button>
        </div>
      )}

      <ProjectCommandPalette />
      {/* Last flex child on purpose: when pinned it docks to the right of the main region. */}
      <ProjectQuickSettingsRegion />
    </div>
  );
}

export default memo(ProjectWorkspaceShell);
