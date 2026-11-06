import { memo, useEffect, useRef, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { readDraftText, writeDraftText } from '@/shared/chatDrafts';
import { useWebSocket } from '@/shared/context/WebSocketContext';
import { useUiPreferences } from '@/shared/context/UiPreferencesContext';
import type { Project, SessionEstablishedContext } from '@/shared/types';
import { ChatInterface, Markdown } from '@/modules/chat';
import { claimTicketForChat, useQueue } from '@/modules/queue/queueStore';

type TicketPage = { number: number; title: string; url: string; labels: string[]; body: string; createdAt: string };

/**
 * quests priority queue: a ticket's tab is a new chat for it. The ticket's page (title, labels, the issue's text)
 * fills the chat until the first message, and the input box holds "claim ticket #<n> <link>", ready to send or to
 * add to (Noam, 6 Nov: "tickets unclaimed need a chat in their screen that has a preset \"claim ticket #<>\" with
 * an ability to say more. this should then update the ticket status and the chat status in the queue"). Sending
 * starts the chat: the tab becomes the chat's tab, and the queue counts the chat as the ticket's at once (the
 * chat's own claim comment on GitHub follows). The ticket link in a chat's first prompt is what claims it.
 */
function TicketView({ number, project, onStarted }: {
  number: number;
  /** The folder the ticket's chat starts in. */
  project: Project | null;
  /** The chat got its session id: the caller turns the tab into the chat's. */
  onStarted: (sessionId: string, context: SessionEstablishedContext) => void;
}) {
  // What was loaded, with its number: a page for another ticket is not drawn while this one loads.
  const [loaded, setLoaded] = useState<{ number: number; ticket: TicketPage | null; error: string | null } | null>(null);
  const entry = useQueue().entries.find((e) => e.key === `ticket:${number}`);
  const ticket = loaded?.number === number ? loaded.ticket : null;
  const error = loaded?.number === number ? loaded.error : null;
  const { ws, sendMessage } = useWebSocket();
  const { showRawParameters, showThinking, sendByCtrlEnter } = useUiPreferences();

  useEffect(() => {
    let stopped = false;
    void (async () => {
      const response = await authenticatedFetch(`/api/quests/queue/ticket/${number}`);
      if (stopped) return;
      if (!response.ok) {
        setLoaded({ number, ticket: null, error: response.status === 404 ? 'This ticket is not open.' : `Could not load the ticket (${response.status}).` });
        return;
      }
      setLoaded({ number, ticket: (await response.json()).data as TicketPage, error: null });
    })();
    return () => { stopped = true; };
  }, [number]);

  // The preset prompt, typed in once per ticket before the input box reads its draft; what Noam types after stays.
  const scope = `ticket:${number}`;
  const url = ticket?.url ?? entry?.url;
  const preset = useRef<number | null>(null);
  if (url && preset.current !== number) {
    preset.current = number;
    if (!readDraftText(scope)) writeDraftText(scope, `claim ticket #${number} ${url} `);
  }

  const page = (
    <div className="pb-8 pl-12 pr-8 pt-4" data-quests-ticket={number}>
      <div className="mb-3 flex items-center gap-3">
        <a href={url ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">#{number} on GitHub</a>
        {entry?.sessionId
          ? <span className="text-xs text-muted-foreground">Held by "{entry.title}".</span>
          : <span className="text-xs text-muted-foreground">Sending the message below starts this ticket's chat and claims the ticket.</span>}
      </div>
      {ticket && <h1 className="mb-2 text-lg font-semibold">{ticket.title}</h1>}
      {ticket && ticket.labels.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1 text-xs text-muted-foreground">
          {ticket.labels.map((l) => <span key={l} className="rounded-sm border border-[#454647] px-1.5">{l}</span>)}
        </div>
      )}
      {error && <div className="text-sm text-muted-foreground">{error}</div>}
      {ticket && (
        <Markdown className="prose prose-sm max-w-none dark:prose-invert">
          {ticket.body || '(this ticket has no text)'}
        </Markdown>
      )}
    </div>
  );

  if (!project || !url) {
    return <div className="min-h-0 flex-1 overflow-y-auto bg-background">{page}</div>;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-quests-ticket-chat={number}>
      <ChatInterface
        key={number}
        isActive
        selectedProject={project}
        selectedSession={null}
        ws={ws}
        sendMessage={sendMessage}
        onSessionEstablished={(id, context) => { void claimTicketForChat(number, id); onStarted(id, context); }}
        onNavigateToSession={() => undefined}
        showRawParameters={showRawParameters}
        showThinking={showThinking}
        sendByCtrlEnter={sendByCtrlEnter}
        newChatScope={scope}
        intro={page}
      />
    </div>
  );
}

export default memo(TicketView);
