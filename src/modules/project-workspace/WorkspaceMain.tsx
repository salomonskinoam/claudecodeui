import React, { useCallback, useEffect, type Dispatch, type SetStateAction, useState } from 'react';

import { ChatInterface } from '@/modules/chat';
import { FileTree } from '@/modules/file-tree';
import { StandaloneShell } from '@/modules/standalone-shell';
import { GitPanel } from '@/modules/git-panel';
import { PluginTabContent } from '@/modules/plugins';
import { BrowserUsePanel, useBrowserUseEnabled } from '@/modules/browser-use';
import { usePaletteOpsRegister } from '@/modules/command-palette';
import { TaskMasterPanel, useTaskMasterProjectSync, useTasksSettings } from '@/modules/task-master';
import type { AppTab, DirectoryRevealRequest, Project, ProjectSession, SessionEstablishedContext, SessionNavigationOptions, SettingsMainTab } from '@/shared/types';
import { useUiPreferences } from '@/shared/context/UiPreferencesContext';
import { useFileOpenResolver } from '@/modules/project-workspace/hooks/useFileOpenResolver';
import { EditorSidebar, useEditorSidebar } from '@/modules/code-editor';
import WorkspaceHeader from '@/modules/project-workspace/WorkspaceHeader';
import WorkspaceStateView from '@/modules/project-workspace/WorkspaceStateView';
import WorkspaceErrorBoundary from '@/modules/project-workspace/WorkspaceErrorBoundary';
import { keepChats, nextToPreload, preloadChat, type KeptChat } from '@/modules/project-workspace/keptChats';
import { useProjectSidebarState } from '@/modules/project-workspace/context/ProjectsStateContext';
import { isEmbedded, usePanes } from '@/shared/hooks/useSplitPane';

type WorkspaceMainProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  isMobile: boolean;
  onMenuClick: () => void;
  isLoading: boolean;
  onNavigateToSession: (targetSessionId: string, options?: SessionNavigationOptions) => void;
  onSessionEstablished: (sessionId: string, context: SessionEstablishedContext) => void;
  onShowSettings: (tab?: SettingsMainTab) => void;
  externalMessageUpdate: number;
  newSessionTrigger: number;
  /** Switches the app to another project — used by the git panel's Worktrees view. */
  onProjectSelect: (project: Project) => void;
  /** Silently re-syncs the sidebar project list after worktree projects change. */
  onProjectsRefresh: () => void;
  /** Persists a new title for a session; resolves false when the backend refuses it. Used by the header's inline rename. */
  onRenameSession: (sessionId: string, summary: string) => Promise<boolean>;
  /** quests: a plan, work or ticket tab is shown over the chats: every chat view stays built and hidden. */
  covered?: boolean;
};

/** Rendered by ProjectMainRegion to show the selected project's active tab: chat, files, shell, git, tasks, browser or a plugin. */
function WorkspaceMain({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab,
  ws,
  sendMessage,
  isMobile,
  onMenuClick,
  isLoading,
  onNavigateToSession,
  onSessionEstablished,
  onShowSettings,
  externalMessageUpdate,
  newSessionTrigger,
  onProjectSelect,
  onProjectsRefresh,
  onRenameSession,
  covered = false,
}: WorkspaceMainProps) {
  const preferences = useUiPreferences();
  const { showRawParameters, showThinking, sendByCtrlEnter } = preferences;

  const { tasksEnabled, isTaskMasterInstalled } = useTasksSettings();
  const browserUseEnabled = useBrowserUseEnabled();

  useTaskMasterProjectSync(selectedProject);
  // The folder an in-chat `path/` reference asked to reveal. Held as an object
  // so that re-clicking the same folder is a new request the tree acts on.
  const [revealDirectory, setRevealDirectory] = useState<DirectoryRevealRequest | null>(null);

  const shouldShowTasksTab = Boolean(tasksEnabled && isTaskMasterInstalled);
  const shouldShowBrowserTab = browserUseEnabled;

  const {
    editingFile,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    resizeHandleRef,
    handleFileOpen,
    handleCloseEditor,
    handleToggleEditorExpand,
    handleResizeStart,
    handleUnsavedChangesChange,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });

  // Resolves bare/partial file references (e.g. links inside chat messages) to
  // real project files before opening them in the in-app editor.
  const resolvedFileOpen = useFileOpenResolver(selectedProject, handleFileOpen);

  useEffect(() => {
    if (!shouldShowTasksTab && activeTab === 'tasks') {
      setActiveTab('chat');
    }
  }, [shouldShowTasksTab, activeTab, setActiveTab]);

  useEffect(() => {
    if (!shouldShowBrowserTab && activeTab === 'browser') {
      setActiveTab('chat');
    }
  }, [shouldShowBrowserTab, activeTab, setActiveTab]);

  // Stable so React.memo(ChatInterface) can bail out: an inline arrow here made
  // every WorkspaceMain render re-render the whole chat tree, including during
  // an editor-divider drag.
  const showAllTasks = useCallback(() => {
    setActiveTab('tasks');
  }, [setActiveTab]);

  const openFile = useCallback((filePath: string) => {
    if (handleFileOpen(filePath)) {
      setActiveTab('files');
    }
  }, [handleFileOpen, setActiveTab]);

  // Opens the editor side panel in place, keeping the current tab (e.g. chat).
  const openFileInEditor = useCallback((filePath: string, line?: number | null) => {
    resolvedFileOpen(filePath, undefined, line);
  }, [resolvedFileOpen]);

  // Directories cannot be read as text: reveal them in the file tree instead.
  const openDirectory = useCallback((directoryPath: string) => {
    setActiveTab('files');
    setRevealDirectory({ path: directoryPath });
  }, [setActiveTab]);

  // Stable arguments keep usePaletteOpsRegister's effect from tearing down and
  // rewriting the whole palette registry on every render.
  usePaletteOpsRegister({ openFile, openFileInEditor, openDirectory });

  // quests: the chats of the open left tabs stay built; a switch shows one and hides the rest (keptChats.ts).
  const { left: openTabs } = usePanes();
  // Derived during render (React's pattern for state that follows props), so the switch draws in one pass.
  const [kept, setKept] = useState<KeptChat[]>([]);
  const [keptFor, setKeptFor] = useState<unknown[]>([]);
  // Covered (the address is a plan, work or ticket tab, with no chat), the views stay as they are.
  if (!covered && (keptFor[0] !== selectedProject || keptFor[1] !== selectedSession || keptFor[2] !== openTabs)) {
    setKeptFor([selectedProject, selectedSession, openTabs]);
    setKept(keepChats(kept, selectedProject, selectedSession, openTabs, Date.now()));
  }
  // The other open tabs are built in the background, one every 1.5 s once the shown chat is drawn (each build
  // holds the page for a moment). The right pane's page builds nothing: its tabs are the left pane's.
  const { projects } = useProjectSidebarState().sidebarSharedProps;
  const nextId = isEmbedded ? undefined : nextToPreload(kept, openTabs, projects)?.session.id;
  useEffect(() => {
    if (!nextId) return undefined;
    const timer = window.setTimeout(() => setKept((prev) => {
      const chat = nextToPreload(prev, openTabs, projects);
      return chat ? preloadChat(prev, chat.project, chat.session) : prev;
    }), 1500);
    return () => window.clearTimeout(timer);
    // The id alone restarts the wait: a sidebar refresh (a new projects array) must not postpone it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId, selectedSession?.id]);
  const shownKey = kept.reduce<KeptChat | null>((a, k) => (a && a.shownAt >= k.shownAt ? a : k), null)?.key;
  const chatShown = activeTab === 'chat' && !covered;

  if (isLoading) {
    return <WorkspaceStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  if (!selectedProject) {
    return <WorkspaceStateView mode="empty" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* quests: on desktop the chat has no header strip (the tab row names the chat, and the pinned user
          message takes the top). Other views (shell, files) keep it, so there is always a way back to the chat. */}
      {(isMobile || activeTab !== 'chat') && (
        <WorkspaceHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedProject={selectedProject}
          selectedSession={selectedSession}
          shouldShowTasksTab={shouldShowTasksTab}
          shouldShowBrowserTab={shouldShowBrowserTab}
          isMobile={isMobile}
          onMenuClick={onMenuClick}
          onRenameSession={onRenameSession}
        />
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={`relative flex min-h-0 min-w-[200px] flex-col overflow-hidden ${editorExpanded ? 'hidden' : ''} flex-1`}>
          {kept.map((k) => (
            <div
              key={k.key}
              data-chat-view={k.key === shownKey ? 'shown' : 'kept'}
              // Every view keeps the same box and stays laid out; a hidden one is only moved out of the pane by a
              // transform, so showing it again needs no new layout (measured on a 156-row chat, headless: under
              // 1 ms; display none 130 ms, the inert attribute 60 ms, visibility hidden 30 ms).
              // ponytail: a hidden view can still take focus by the Tab key; inert if that ever matters.
              className="absolute inset-0"
              style={chatShown && k.key === shownKey ? undefined : { transform: 'translateX(-200%)' }}
            >
              <WorkspaceErrorBoundary showDetails>
                <ChatInterface
                  isActive={chatShown && k.key === shownKey}
                  isHiddenTab={covered || k.key !== shownKey}
                  selectedProject={k.project}
                  selectedSession={k.session}
                  ws={ws}
                  sendMessage={sendMessage}
                  onFileOpen={handleFileOpen}
                  onNavigateToSession={onNavigateToSession}
                  onSessionEstablished={onSessionEstablished}
                  onShowSettings={onShowSettings}
                  showRawParameters={showRawParameters}
                  showThinking={showThinking}
                  sendByCtrlEnter={sendByCtrlEnter}
                  externalMessageUpdate={externalMessageUpdate}
                  newSessionTrigger={newSessionTrigger}
                  onShowAllTasks={tasksEnabled ? showAllTasks : null}
                />
              </WorkspaceErrorBoundary>
            </div>
          ))}

          {activeTab === 'files' && (
            <div className="h-full overflow-hidden">
              <FileTree
                selectedProject={selectedProject}
                onFileOpen={handleFileOpen}
                revealDirectory={revealDirectory}
              />
            </div>
          )}

          {activeTab === 'shell' && (
            <div className="h-full w-full overflow-hidden">
              <StandaloneShell
                project={selectedProject}
                session={selectedSession}
                showHeader={false}
                isActive={activeTab === 'shell'}
              />
            </div>
          )}

          {activeTab === 'git' && (
            <div className="h-full overflow-hidden">
              <GitPanel
                selectedProject={selectedProject}
                isMobile={isMobile}
                onFileOpen={handleFileOpen}
                onProjectSelect={onProjectSelect}
                onProjectsRefresh={onProjectsRefresh}
              />
            </div>
          )}

          {shouldShowTasksTab && <TaskMasterPanel isVisible={activeTab === 'tasks'} />}

          {shouldShowBrowserTab && activeTab === 'browser' && (
            <div className="h-full overflow-hidden">
              <BrowserUsePanel isVisible={activeTab === 'browser'} onShowSettings={onShowSettings} />
            </div>
          )}

          {activeTab.startsWith('plugin:') && (
            <div className="h-full overflow-hidden">
              <PluginTabContent
                pluginName={activeTab.replace('plugin:', '')}
                selectedProject={selectedProject}
                selectedSession={selectedSession}
              />
            </div>
          )}
        </div>

        <EditorSidebar
          editingFile={editingFile}
          isMobile={isMobile}
          editorExpanded={editorExpanded}
          editorWidth={editorWidth}
          hasManualWidth={hasManualWidth}
          resizeHandleRef={resizeHandleRef}
          onResizeStart={handleResizeStart}
          onCloseEditor={handleCloseEditor}
          onToggleEditorExpand={handleToggleEditorExpand}
          onUnsavedChangesChange={handleUnsavedChangesChange}
          projectPath={selectedProject.path}
          fillSpace={activeTab === 'files'}
        />
      </div>
    </div>
  );
}

export default React.memo(WorkspaceMain);
