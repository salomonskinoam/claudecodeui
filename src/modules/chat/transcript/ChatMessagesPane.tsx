import { useTranslation } from 'react-i18next';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MouseEvent, RefObject, SetStateAction } from 'react';

import type { BackgroundTaskSummary,
  ChatMessage,
  Project,
  ProjectSession,
  LLMProvider,
  ProviderModelActions,
  ProviderModelsDefinition } from '@/shared/types';
import { getIntrinsicMessageKey } from '@/modules/chat/utils/messageKeys';
import { groupConsecutiveTools, isToolGroupItem } from '@/modules/chat/utils/toolGrouping';
import { isReply } from '@/modules/chat/utils/repeatedReplies';
import { TOOL_LINE, isRowOpen, setRowOpen, useRowOpenVersion } from '@/modules/chat/ledger/rowOpen';
import LazyMessageRow from '@/modules/chat/transcript/LazyMessageRow';
import MessageComponent from '@/modules/chat/transcript/MessageComponent';
import ProviderSelectionEmptyState from '@/modules/chat/transcript/ProviderSelectionEmptyState';
import ToolGroupContainer from '@/modules/chat/transcript/ToolGroupContainer';
import LoadAllMessagesOverlay from '@/modules/chat/transcript/LoadAllMessagesOverlay';
import ChatExportMenu from '@/modules/chat/transcript/ChatExportMenu';
import { BackgroundTasksStrip } from '@/modules/chat/transcript/BackgroundTasksStrip';

/**
 * How many of the newest rows mount with real content on the first commit,
 * before the lazy-row observer has had a chance to report what is actually
 * near the viewport. Covers a bit more than one screen of typical rows.
 */
const INITIAL_MOUNTED_TAIL_ROWS = 30;

type ChatMessagesPaneProps = {
  scrollContainerRef: RefObject<HTMLDivElement>;
  onWheel: () => void;
  onTouchMove: () => void;
  isLoadingSessionMessages: boolean;
  /** True while the viewed session has an active provider run in flight. */
  isProcessing?: boolean;
  /** True while ChatComposer's floating activity/stop tab is rendered above the input. */
  hasActivityIndicator?: boolean;
  chatMessages: ChatMessage[];
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  provider: LLMProvider;
  setProvider: (provider: LLMProvider) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  providerModels: Record<LLMProvider, string>;
  setProviderModel: (provider: LLMProvider, model: string) => void;
  providerModelCatalog: Partial<Record<LLMProvider, ProviderModelsDefinition>>;
  providerModelActions: ProviderModelActions;
  providerModelsLoading: boolean;
  tasksEnabled: boolean;
  isTaskMasterInstalled: boolean | null;
  onShowAllTasks?: (() => void) | null;
  setInput: Dispatch<SetStateAction<string>>;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  totalMessages: number;
  sessionMessagesCount: number;
  visibleMessageCount: number;
  visibleMessages: ChatMessage[];
  loadEarlierMessages: () => void;
  /** quests: fetches the next older page from the server; the pinned user message preloads with it. */
  loadOlderMessages: (container: HTMLDivElement) => Promise<boolean>;
  revealMessage: (message: ChatMessage) => void;
  /** The session's running background tasks from the activity map, for the strip to list ones whose rows are not loaded. */
  backgroundTasks?: BackgroundTaskSummary[];
  /** The chat websocket's send, which the background-tasks strip stops a task over. */
  sendMessage: (message: unknown) => void;
  loadAllMessages: () => void;
  allMessagesLoaded: boolean;
  isLoadingAllMessages: boolean;
  loadAllJustFinished: boolean;
  showLoadAllOverlay: boolean;
  createDiff: any;
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onShowSettings?: () => void;
  onGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
  showRawParameters?: boolean;
  showThinking?: boolean;
  selectedProject: Project;
  /** Loads an already-sent message back into the composer; absent when the provider cannot re-run from a point. */
  onEditMessage?: (message: ChatMessage) => void;
  /** Branches the conversation into a new session ending at a message. */
  onForkFromMessage?: (message: ChatMessage) => void;
  /** Fetches the whole transcript for an export, which otherwise only sees the loaded page. */
  onLoadFullTranscript?: () => Promise<ChatMessage[]>;
};

/**
 * quests: a click on a collapsed tool line's 7 px opens it, a click on the line of an open one closes it; a click
 * inside an open one works as usual. The state is the row's own, by id (rowOpen.ts), so React's re-renders draw
 * it back and a remount keeps it.
 */
function onToolLineClick(event: MouseEvent<HTMLDivElement>): void {
  const el = (event.target as HTMLElement).closest?.('.chat-message');
  if (!(el instanceof HTMLElement) || !el.matches(TOOL_LINE)) return;
  const rowId = el.dataset.rowId;
  if (!rowId) return;
  const open = isRowOpen(rowId);
  if (open && event.clientY - el.getBoundingClientRect().top > 7) return;
  setRowOpen(rowId, !open);
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Keys for the rows inside a collapsed tool group. They only have to be unique
 * among that group's own rows (ToolGroupContainer disambiguates repeats), so
 * they do not depend on the pane's per-render key map — and being a module
 * function, the prop keeps its identity, which is what lets
 * memo(ToolGroupContainer) skip a group on a stream tick that did not touch it.
 */
const getGroupedMessageKey = (message: ChatMessage): string =>
  getIntrinsicMessageKey(message) ?? 'message-generated';

/**
 * quests: as in Cursor, the user message of the turn at the top of the view stays pinned at the top of the chat:
 * the last user message whose top has scrolled above the view. Scrolling up hands the pin to the one before, and
 * as the next user message comes up under the pin it pushes the pin up and out, so the two never overlap.
 * Clicking the pin scrolls to the message. Read straight from the page: every loaded message stays mounted
 * (lazyRows is off), and when the turn's user message is older than the loaded page, the earlier page is
 * preloaded. System notices recorded as user messages are skipped. Its own component, so scrolling re-renders the pin
 * only, never the transcript.
 */
const StickyUserPin = memo(function StickyUserPin({
  paneRef,
  chatMessages,
  hasMoreMessages,
  isLoadingMoreMessages,
  loadOlderMessages,
  onHeight,
}: {
  paneRef: RefObject<HTMLDivElement>;
  chatMessages: ChatMessage[];
  hasMoreMessages: boolean;
  isLoadingMoreMessages: boolean;
  loadOlderMessages: (container: HTMLDivElement) => Promise<boolean>;
  /** quests: the pin's height on screen (0 without a pin), so the background-work strip sits under it, never behind it. */
  onHeight: (height: number) => void;
}) {
  const [pinned, setPinned] = useState<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);
  const pinRef = useRef<HTMLButtonElement | null>(null);
  // Set by the user's own scrolling (wheel, touch, keys). The 3-screens-ahead preload waits for it: on a fresh
  // load the view sits at the top for a moment before the chat scrolls to the bottom, and preloading then
  // competed with that initial scroll, leaving the chat part-way up.
  const userScrolledRef = useRef(false);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) {
      return undefined;
    }
    const update = () => {
      const paneTop = pane.getBoundingClientRect().top;
      let above: HTMLElement | null = null;
      let next: HTMLElement | null = null;
      for (const message of pane.querySelectorAll<HTMLElement>('.chat-message.user')) {
        // Only messages the user wrote: system notices recorded as user messages (a finished background
        // command, for example) have no text box and would pin as an empty box. textContent, not innerText:
        // the browser skips rendering off-screen rows, and innerText is then empty.
        if (!message.querySelector<HTMLElement>('[dir="auto"]')?.textContent?.trim()) {
          continue;
        }
        if (message.getBoundingClientRect().top < paneTop - 1) {
          above = message;
        } else {
          next = message;
          break;
        }
      }
      setPinned(above);
      // Preload the earlier page (this runs again after each load) while: the turn at the top of the view has
      // its user message older than the loaded page; no user message is loaded at all; or the loaded messages
      // do not fill the pane. Collapsed tool calls are only 9px tall, so a page of them often fits without a
      // scrollbar, and the app loads older history only on a scroll to the top.
      const firstRow = pane.querySelector<HTMLElement>('[data-message-timestamp]');
      const topTurnUnloaded = !above && firstRow !== null && firstRow.getBoundingClientRect().top < paneTop - 1;
      const noUserLoaded = !above && !next;
      const notFilled = pane.scrollHeight <= pane.clientHeight + 1;
      // And ahead of a scroll up: within 3 screens of the top, so the next page is in before the top is reached.
      const nearTop = userScrolledRef.current && pane.scrollTop < pane.clientHeight * 3;
      if (hasMoreMessages && !isLoadingMoreMessages && (topTurnUnloaded || noUserLoaded || notFilled || nearTop)) {
        void loadOlderMessages(pane);
      }
      const gap = next ? next.getBoundingClientRect().top - paneTop : Infinity;
      const pinHeight = pinRef.current?.offsetHeight ?? 0;
      const pushedUp = Math.min(0, Math.round(gap - pinHeight - 8));
      setOffset(pushedUp);
      onHeight(above ? Math.max(0, pinHeight + pushedUp) : 0);
    };
    update();
    const markUserScroll = () => {
      userScrolledRef.current = true;
    };
    pane.addEventListener('scroll', update, { passive: true });
    pane.addEventListener('wheel', markUserScroll, { passive: true });
    pane.addEventListener('touchmove', markUserScroll, { passive: true });
    pane.addEventListener('keydown', markUserScroll);
    return () => {
      pane.removeEventListener('scroll', update);
      pane.removeEventListener('wheel', markUserScroll);
      pane.removeEventListener('touchmove', markUserScroll);
      pane.removeEventListener('keydown', markUserScroll);
    };
  }, [paneRef, chatMessages, hasMoreMessages, isLoadingMoreMessages, loadOlderMessages, onHeight]);

  if (!pinned) {
    return null;
  }
  return (
    <div className="sticky top-0 z-20 h-0">
      <button
        ref={pinRef}
        type="button"
        title="Scroll to this message"
        style={{ transform: `translateY(${offset}px)` }}
        onClick={() => pinned.scrollIntoView({ block: 'start' })}
        className="quests-sticky-user absolute left-12 right-8 top-0 px-3 py-2 text-left text-sm"
      >
        {/* Clamped on an inner span: clamping the padded button let a 4th line show in its bottom padding. */}
        <span className="line-clamp-3 whitespace-pre-wrap">
          {pinned.querySelector<HTMLElement>('[dir="auto"]')?.textContent ?? ''}
        </span>
      </button>
    </div>
  );
});

/**
 * Rendered by chat's ChatInterface as the scrolling transcript: the message
 * list and tool groups, the export menu, the provider empty state and the
 * load-all-history overlay.
 */
function ChatMessagesPane({
  scrollContainerRef,
  onWheel,
  onTouchMove,
  isLoadingSessionMessages,
  isProcessing = false,
  hasActivityIndicator = false,
  chatMessages,
  selectedSession,
  currentSessionId,
  provider,
  setProvider,
  textareaRef,
  providerModels,
  setProviderModel,
  providerModelCatalog,
  providerModelActions,
  providerModelsLoading,
  tasksEnabled,
  isTaskMasterInstalled,
  onShowAllTasks,
  setInput,
  isLoadingMoreMessages,
  hasMoreMessages,
  totalMessages,
  sessionMessagesCount,
  visibleMessageCount,
  visibleMessages,
  loadEarlierMessages,
  loadOlderMessages,
  revealMessage,
  backgroundTasks,
  sendMessage,
  loadAllMessages,
  allMessagesLoaded,
  isLoadingAllMessages,
  loadAllJustFinished,
  showLoadAllOverlay,
  createDiff,
  onEditMessage,
  onForkFromMessage,
  onLoadFullTranscript,
  onFileOpen,
  onShowSettings,
  onGrantToolPermission,
  showRawParameters,
  showThinking,
  selectedProject,
}: ChatMessagesPaneProps) {
  const { t } = useTranslation('chat');
  // quests: rows read only the project's id and path. A new project object with the same two (a sidebar refresh,
  // a tab switch) must not redraw every row (measured: most of a switch's rendering).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rowProject = useMemo(() => selectedProject, [selectedProject.projectId, selectedProject.fullPath]);
  // quests: every loaded message stays mounted. Unmounting rows off screen swapped them for estimated-height
  // placeholders, so the content height changed while scrolling and the view jumped.
  const lazyRows = null;
  // quests: the pinned user message's height, so the strip of background work sticks under it (Noam, 3 Nov:
  // "UNDER THE PINNED USER MESSAGE is something else ... was under the pinned message").
  const [pinHeight, setPinHeight] = useState(0);

  const groupedVisibleMessages = useMemo(
    () => groupConsecutiveTools(visibleMessages, Boolean(showThinking)),
    [visibleMessages, showThinking],
  );
  // quests: the folds are the ledger's decision, made once when each row was appended (requirement 39 at
  // append, requirement 52 point 5): a row carries its fold id, or none. The pane only draws them: the rows
  // of a fold are hidden until its line is clicked, and the fold's first row draws the line. Over the whole
  // transcript held, never only the visible window.
  const openVersion = useRowOpenVersion();
  const folds = useMemo(() => {
    const first = new Map<string, ChatMessage>();
    const count = new Map<string, number>();
    const from = new Map<string, string>();
    const to = new Map<string, string>();
    for (const m of chatMessages) {
      if (!m.foldId) continue;
      if (!first.has(m.foldId)) first.set(m.foldId, m);
      if (isReply(m)) {
        count.set(m.foldId, (count.get(m.foldId) ?? 0) + 1);
        const stamp = String(m.timestamp ?? '');
        if (!from.has(m.foldId)) from.set(m.foldId, stamp);
        to.set(m.foldId, stamp);
      }
    }
    return { first, count, from, to };
  }, [chatMessages]);
  const foldOf = useCallback((item: ChatMessage | { messages: ChatMessage[] }): { id: string; first: boolean } | null => {
    const message = 'messages' in item ? (item as { messages: ChatMessage[] }).messages[0] : (item as ChatMessage);
    const id = message.foldId;
    if (!id || isRowOpen(`fold:${id}`)) return null;
    return { id, first: folds.first.get(id) === message };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folds, openVersion]);
  const foldLine = (id: string) => {
    const at = (iso: string | undefined) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
    const count = folds.count.get(id) ?? 1;
    return (
      <div key={`fold-${id}`} className="my-2 flex items-center gap-2 text-xs text-muted-foreground" data-quests-fold={id}>
        <span className="h-px flex-1 bg-border/60" />
        <button
          type="button"
          className="rounded px-2 py-0.5 hover:bg-muted hover:text-foreground"
          onClick={() => setRowOpen(`fold:${id}`, true)}
          title="These replies said the same as the one before them; click to show them"
        >
          {count} more {count === 1 ? 'reply' : 'replies'} with the same state, {at(folds.from.get(id))} to {at(folds.to.get(id))} · show
        </button>
        <span className="h-px flex-1 bg-border/60" />
      </div>
    );
  };

  // Stable, deterministic keys for the messages rendered this pass.
  //
  // A server refresh can replace source records with equivalent new objects, so
  // object identity is not a durable React key across pagination or hydration.
  // Deriving keys from this render's ordered messages (intrinsic key,
  // disambiguated by occurrence index on collision) preserves existing DOM
  // nodes and component state when older history is prepended.
  const messageKeyMap = useMemo(() => {
    const keys = new WeakMap<ChatMessage, string>();
    const occurrences = new Map<string, number>();
    const assign = (message: ChatMessage) => {
      const intrinsicKey = getIntrinsicMessageKey(message) ?? 'message-generated';
      const seen = occurrences.get(intrinsicKey) ?? 0;
      occurrences.set(intrinsicKey, seen + 1);
      keys.set(message, seen === 0 ? intrinsicKey : `${intrinsicKey}__${seen}`);
    };
    for (const item of groupedVisibleMessages) {
      if (isToolGroupItem(item)) {
        item.messages.forEach(assign);
      } else {
        assign(item);
      }
    }
    return keys;
  }, [groupedVisibleMessages]);

  const getMessageKey = useCallback(
    (message: ChatMessage) =>
      messageKeyMap.get(message) ?? getIntrinsicMessageKey(message) ?? 'message-generated',
    [messageKeyMap],
  );

  // quests: stick to the bottom. A fresh load opens at the bottom, and while the view is at the bottom (within
  // 50px) any growth of the content keeps it there: late rendering, older history preloaded above, the
  // running-chat indicator's padding, new messages. Scrolling up by hand stops the following until the user
  // comes back down. The paddings sit on the content (not the scroller) so every change resizes it.
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const pane = scrollContainerRef.current;
    const content = contentRef.current;
    if (!pane || !content || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    let atBottom = true;
    const onScroll = () => {
      atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 50;
    };
    const follow = new ResizeObserver(() => {
      if (atBottom) {
        pane.scrollTop = pane.scrollHeight;
      }
    });
    pane.addEventListener('scroll', onScroll, { passive: true });
    follow.observe(content, { box: 'border-box' }); // border-box: the padding grows with the running-chat indicator
    follow.observe(pane); // the pane itself shrinks when the area under it grows (running-chat indicator)
    return () => {
      pane.removeEventListener('scroll', onScroll);
      follow.disconnect();
    };
  }, [scrollContainerRef]);

  return (
    <div
      ref={scrollContainerRef}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      className="chat-messages-pane relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
    >
      <StickyUserPin
        paneRef={scrollContainerRef}
        chatMessages={chatMessages}
        hasMoreMessages={hasMoreMessages}
        isLoadingMoreMessages={isLoadingMoreMessages}
        loadOlderMessages={loadOlderMessages}
        onHeight={setPinHeight}
      />
      {chatMessages.length > 0 && (
        <div className="pointer-events-none sticky right-4 z-10 mb-2 flex items-start justify-between gap-2 sm:px-4" style={{ top: pinHeight ? pinHeight + 8 : 12 }}>
          {/* Running background work stays in view while the transcript scrolls under it. */}
          <div className="pointer-events-auto min-w-0 pl-4 sm:pl-0">
            <BackgroundTasksStrip
              messages={chatMessages}
              tasks={backgroundTasks}
              sessionId={selectedSession?.id || currentSessionId}
              sendMessage={sendMessage}
              onReveal={revealMessage}
              onLoadAll={loadAllMessages}
            />
          </div>
          <div className="pointer-events-auto">
            <ChatExportMenu
              messages={chatMessages}
              sessionTitle={selectedSession?.summary || selectedSession?.title}
              provider={provider}
              selectedProject={selectedProject}
              createDiff={createDiff}
              onLoadFullTranscript={onLoadFullTranscript}
            />
          </div>
        </div>
      )}
      {/* quests: the top padding sits here, not on the scrolling container, so the pinned message sticks flush under the tab row. */}
      <div
        ref={contentRef}
        onClickCapture={onToolLineClick}
        className={`w-full space-y-3 pl-12 pr-8 pt-4 sm:space-y-4 ${hasActivityIndicator ? 'pb-14' : 'pb-4'}`}
      >
      {(isLoadingSessionMessages || isProcessing) && chatMessages.length === 0 ? (
        <div className="mt-8 text-center text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400" />
            <p>{t('session.loading.sessionMessages')}</p>
          </div>
        </div>
      ) : chatMessages.length === 0 ? (
        <ProviderSelectionEmptyState
          selectedSession={selectedSession}
          currentSessionId={currentSessionId}
          provider={provider}
          setProvider={setProvider}
          textareaRef={textareaRef}
          providerModels={providerModels}
          setProviderModel={setProviderModel}
          providerModelCatalog={providerModelCatalog}
          providerModelActions={providerModelActions}
          providerModelsLoading={providerModelsLoading}
          tasksEnabled={tasksEnabled}
          isTaskMasterInstalled={isTaskMasterInstalled}
          onShowAllTasks={onShowAllTasks}
          setInput={setInput}
        />
      ) : (
        <>
          {/* Loading indicator for older messages (hide when load-all is active) */}
          {isLoadingMoreMessages && !isLoadingAllMessages && !allMessagesLoaded && (
            // quests: the same fixed height as the "more to load" row below, so swapping them never shifts the list.
            <div className="flex h-10 items-center justify-center border-b border-transparent text-gray-500 dark:text-gray-400">
              <div className="flex items-center justify-center space-x-2">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400" />
                <p className="text-sm">{t('session.loading.olderMessages')}</p>
              </div>
            </div>
          )}

          {/* Indicator showing there are more messages to load (hide when all loaded) */}
          {hasMoreMessages && !isLoadingMoreMessages && !allMessagesLoaded && (
            <div className="flex h-10 items-center justify-center border-b border-gray-200 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {totalMessages > 0 && (
                <span>
                  {t('session.messages.showingOf', { shown: sessionMessagesCount, total: totalMessages })}{' '}
                  <span className="text-xs">{t('session.messages.scrollToLoad')}</span>
                </span>
              )}
            </div>
          )}

          <LoadAllMessagesOverlay
            showLoadAllOverlay={showLoadAllOverlay}
            isLoadingAllMessages={isLoadingAllMessages}
            loadAllJustFinished={loadAllJustFinished}
            totalMessages={totalMessages}
            onLoadAllMessages={loadAllMessages}
          />

          {/* Legacy message count indicator (for non-paginated view) */}
          {!hasMoreMessages && chatMessages.length > visibleMessageCount && (
            <div className="border-b border-gray-200 py-2 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {t('session.messages.showingLast', { count: visibleMessageCount, total: chatMessages.length })} |
              <button className="ml-1 text-blue-600 underline hover:text-blue-700" onClick={loadEarlierMessages}>
                {t('session.messages.loadEarlier')}
              </button>
              {' | '}
              <button
                className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                onClick={loadAllMessages}
              >
                {t('session.messages.loadAll')}
              </button>
            </div>
          )}

          {(() => {
            let prevMessage: ChatMessage | null = null;
            const rowCount = groupedVisibleMessages.length;

            return groupedVisibleMessages.map((item, index) => {
              // Rows near the tail mount their content on first commit so the
              // initial scroll-to-bottom measures real heights; older rows
              // start as placeholders and mount when scrolled toward.
              const initiallyNearViewport = index >= rowCount - INITIAL_MOUNTED_TAIL_ROWS;

              const fold = foldOf(item);
              if (fold) {
                return fold.first ? foldLine(fold.id) : null;
              }

              if (isToolGroupItem(item)) {
                const groupPrevMessage = prevMessage;
                prevMessage = item.messages[item.messages.length - 1] || prevMessage;

                return (
                  <LazyMessageRow
                    key={`tool-group-${getMessageKey(item.messages[0])}`}
                    lazyRows={lazyRows}
                    timestamp={item.timestamp}
                    rowId={`tool-group:${item.messages[0]?.id ?? ''}`}
                    initiallyNearViewport={initiallyNearViewport}
                  >
                    <ToolGroupContainer
                      group={item}
                      prevMessage={groupPrevMessage}
                      createDiff={createDiff}
                      getMessageKey={getGroupedMessageKey}
                      onFileOpen={onFileOpen}
                      onShowSettings={onShowSettings}
                      onGrantToolPermission={onGrantToolPermission}
                      showRawParameters={showRawParameters}
                      showThinking={showThinking}
                      selectedProject={rowProject}
                      provider={provider}
                    />
                  </LazyMessageRow>
                );
              }

              const messagePrevMessage = prevMessage;
              prevMessage = item;

              return (
                <LazyMessageRow
                  key={getMessageKey(item)}
                  lazyRows={lazyRows}
                  timestamp={item.timestamp}
                  rowId={item.id}
                  initiallyNearViewport={initiallyNearViewport}
                >
                  <MessageComponent
                    message={item}
                    prevMessage={messagePrevMessage}
                    createDiff={createDiff}
                    onFileOpen={onFileOpen}
                    onShowSettings={onShowSettings}
                    onGrantToolPermission={onGrantToolPermission}
                    showRawParameters={showRawParameters}
                    showThinking={showThinking}
                    selectedProject={rowProject}
                    provider={provider}
                    onEditMessage={onEditMessage}
                    onForkFromMessage={onForkFromMessage}
                  />
                </LazyMessageRow>
              );
            });
          })()}
        </>
      )}
      </div>
    </div>
  );
}

export default memo(ChatMessagesPane);
