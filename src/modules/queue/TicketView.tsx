import { memo, useEffect, useState } from 'react';

import { authenticatedFetch } from '@/shared/api';
import { Markdown } from '@/modules/chat';
import { startTicket } from '@/modules/queue/queueNavigation';
import { useQueue } from '@/modules/queue/queueStore';

type TicketPage = { number: number; title: string; url: string; labels: string[]; body: string; createdAt: string };

/**
 * quests priority queue: a ticket's page, in place of a chat. Its title, labels and text (the GitHub issue, as
 * the queue read it), with "Claim this ticket" while no chat has claimed it: a new chat with "claim this ticket
 * <link>" typed in, not sent (Noam, 3 Nov: "i want to see the ticket body in the chat window for reading, with a
 * ready make prompt saying 'claim this ticket'").
 */
function TicketView({ number }: { number: number }) {
  // What was loaded, with its number: a page for another ticket is not drawn while this one loads.
  const [loaded, setLoaded] = useState<{ number: number; ticket: TicketPage | null; error: string | null } | null>(null);
  const entry = useQueue().entries.find((e) => e.key === `ticket:${number}`);
  const ticket = loaded?.number === number ? loaded.ticket : null;
  const error = loaded?.number === number ? loaded.error : null;

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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background" data-quests-ticket={number}>
      <div className="pb-8 pl-12 pr-8 pt-4">
        <div className="mb-3 flex items-center gap-3">
          <a href={ticket?.url ?? entry?.url ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">#{number} on GitHub</a>
          {entry && !entry.sessionId && (
            <button
              type="button"
              data-quests-ticket-claim={number}
              className="rounded-sm bg-[#3794ff] px-3 py-1 text-[13px] font-medium text-white hover:bg-[#2f7fe0]"
              onClick={() => startTicket(entry)}
            >
              Claim this ticket
            </button>
          )}
          {entry?.sessionId && <span className="text-xs text-muted-foreground">Claimed by "{entry.chatName ?? entry.title}".</span>}
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
    </div>
  );
}

export default memo(TicketView);
