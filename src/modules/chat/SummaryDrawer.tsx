import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { Markdown } from '@/modules/chat/transcript/Markdown';
import { lastSummary } from '@/modules/chat/utils/lastSummary';
import { authenticatedFetch } from '@/shared/api';
import type { ChatMessage } from '@/shared/types';

type About = {
  turns: Array<{ role: 'user' | 'assistant'; text: string; at: string }>;
  busy: boolean;
  error: string | null;
  seconds: number | null;
  thinking: string;
  text: string;
};

// Noam, 11 Nov: "the default text should be to make "what is this world about, what is the basic prompt" and output
// those as two lines with bold "world" and "basic prompt"".
const DEFAULT_ASK = 'what is this world about, what is the basic prompt? Answer in two lines: one starting with **World:**, one starting with **Basic prompt:**.';

/**
 * quests (requirement 117): the About side chat, at the top of the drawer. Made only when Noam sends; the answer
 * stays as it is until he sends again. "New" starts a fresh copy of the chat (server/modules/about).
 */
function AboutSection({ sessionId }: { sessionId: string }) {
  const [about, setAbout] = useState<About | null>(null);
  const [draft, setDraft] = useState(DEFAULT_ASK);
  const [fresh, setFresh] = useState(false);
  const url = `/api/quests/about/${encodeURIComponent(sessionId)}`;
  const load = useCallback(async () => {
    const response = await authenticatedFetch(url);
    if (!response.ok) {
      setAbout({ turns: [], busy: false, error: `The page server does not answer (HTTP ${response.status}).`, seconds: null, thinking: '', text: '' });
      return;
    }
    setAbout((await response.json() as { data: About }).data);
  }, [url]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!about?.busy) return undefined;
    const timer = setInterval(() => { void load(); }, 1000);
    return () => clearInterval(timer);
  }, [about?.busy, load]);
  const send = async () => {
    const response = await authenticatedFetch(url, { method: 'POST', body: JSON.stringify({ text: draft, fresh }) });
    const body = await response.json() as { data?: About; error?: { message?: string } };
    if (body.data) { setAbout(body.data); setDraft(DEFAULT_ASK); setFresh(false); }
    else setAbout((a) => a && { ...a, error: body.error?.message ?? `HTTP ${response.status}` });
  };
  const busy = about?.busy ?? false;
  return (
    <section className="mb-4 border-b border-border/50 pb-3" data-about>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</div>
      {about?.turns.map((turn) => (turn.role === 'user'
        ? <p key={turn.at} className="mb-1 whitespace-pre-wrap text-xs text-muted-foreground">You: {turn.text}</p>
        : <div key={turn.at} className="mb-2"><Markdown>{turn.text}</Markdown></div>))}
      {about?.busy && (
        <div className="mb-2" data-about-live>
          <p className="mb-1 text-xs text-muted-foreground">Making… {about.seconds ?? 0} s{about.thinking && !about.text ? ', thinking' : ''}</p>
          {about.thinking && !about.text && (
            <p className="mb-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs italic text-muted-foreground">{about.thinking}</p>
          )}
          {about.text && <Markdown>{about.text}</Markdown>}
        </div>
      )}
      {about?.error && <p className="mb-2 text-xs text-red-500">{about.error}</p>}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        className="w-full rounded border border-border bg-background p-2 text-xs"
      />
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => { void send(); }}
          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Making…' : 'Send'}
        </button>
        {(about?.turns.length ?? 0) > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => { setFresh(true); setDraft(DEFAULT_ASK); }}
            title="Start a fresh side chat from the chat as it is now"
            className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
          >
            New
          </button>
        )}
      </div>
    </section>
  );
}

const storageKey = (sessionId: string) => `quests.summaryDrawer.${sessionId}`;
const readOpen = (sessionId: string | null): boolean => {
  if (!sessionId) return false;
  try { return localStorage.getItem(storageKey(sessionId)) === 'open'; } catch { return false; }
};

/**
 * quests (requirement 107): a drawer between the chat and the right sidebar that shows the last Summary, so it stays
 * readable while a new turn scrolls it away. Collapsed by default; each chat remembers its own state.
 */
function SummaryDrawer({ sessionId, chatMessages }: { sessionId: string | null; chatMessages: ChatMessage[] }) {
  const [openFor, setOpenFor] = useState<{ id: string | null; open: boolean }>(() => ({ id: sessionId, open: readOpen(sessionId) }));
  const open = openFor.id === sessionId ? openFor.open : readOpen(sessionId);
  const summary = useMemo(() => lastSummary(chatMessages), [chatMessages]);
  if (!sessionId) return null;
  const toggle = () => {
    setOpenFor({ id: sessionId, open: !open });
    try { localStorage.setItem(storageKey(sessionId), open ? 'closed' : 'open'); } catch { /* per-viewer convenience only */ }
  };
  return (
    <div className="flex h-full flex-shrink-0 border-l border-border/50" data-summary-drawer={open ? 'open' : 'closed'}>
      <button
        type="button"
        onClick={toggle}
        title={open ? 'Close the Summary' : 'Open the Summary of the last reply'}
        className="flex w-6 items-center justify-center bg-muted/40 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <span className="[writing-mode:vertical-rl]">Summary</span>
      </button>
      {open && (
        <div className="w-[400px] overflow-y-auto px-4 py-3 text-sm" data-summary-body>
          <AboutSection key={sessionId} sessionId={sessionId} />
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</div>
          {summary ? <Markdown>{summary}</Markdown> : <p className="text-muted-foreground">No Summary yet.</p>}
        </div>
      )}
    </div>
  );
}

export default memo(SummaryDrawer);
