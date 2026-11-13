import { questsUser } from '@/shared/quests-instance.js';
import { ticketsRepo, gh } from '@/modules/queue/gh.js';

/**
 * quests priority queue, source: the open tickets. One paged GraphQL call every 15 seconds keeps them in memory;
 * closing a ticket from the page goes through here too, so every ticket read and write has one home.
 */

const SID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const CLAIM = /Claimed by chat (.+?), session ([0-9a-f-]{36})/g;

export type Ticket = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  labels: string[];
  parent: { number: number; state: string } | null;
  /** Claims in comment order, the newest last; `at` is the comment's time (epoch ms). */
  claims: Array<{ name: string; sid: string; at: number }>;
  /** Session ids in the "## Blocks" section. */
  blocksSids: string[];
  /** The session id in the "## Parent chat" section. */
  parentChatSid: string | null;
  /** The issue's text, for the ticket page. */
  body: string;
};

let tickets: Ticket[] = [];
export const getTickets = () => tickets;

const section = (body: string, name: string): string =>
  body.match(new RegExp(`## ${name}([\\s\\S]*?)(\\n## |$)`))?.[1] ?? '';

const QUERY = `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) {
  issues(states: OPEN, first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes {
    number title url body createdAt labels(first: 20) { nodes { name } } parent { number state }
    comments(last: 50) { nodes { body createdAt } } } } } }`;

type IssueNode = {
  number: number; title: string; url: string; body: string; createdAt: string;
  labels: { nodes: Array<{ name: string }> }; parent: { number: number; state: string } | null;
  comments: { nodes: Array<{ body: string; createdAt: string }> };
};

export async function refreshTickets(): Promise<void> {
  const nodes: IssueNode[] = [];
  let cursor: string | null = null;
  do {
    const [owner, name] = ticketsRepo().split('/');
    const stdout = await gh(['api', 'graphql', '-f', `query=${QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, ...(cursor ? ['-f', `cursor=${cursor}`] : [])], 64 * 1024 * 1024);
    const page = JSON.parse(stdout).data.repository.issues;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  tickets = nodes.map((n) => ({
    number: n.number,
    title: n.title,
    url: n.url,
    createdAt: n.createdAt,
    labels: n.labels.nodes.map((l) => l.name),
    parent: n.parent,
    claims: n.comments.nodes.flatMap((c) => [...c.body.matchAll(CLAIM)].map((m) => ({ name: m[1], sid: m[2], at: Date.parse(c.createdAt) || 0 }))),
    blocksSids: [...section(n.body, 'Blocks').matchAll(SID)].map((m) => m[0]),
    parentChatSid: section(n.body, 'Parent chat').match(SID)?.[0] ?? null,
    body: n.body,
  }));
}

/** The open blockers of a ticket: its open sub-issues labeled blocker, and open blockers naming a chat that claimed it. */
export function openBlockersOf(number: number): number[] {
  const t = tickets.find((x) => x.number === number);
  const sids = new Set(t?.claims.map((c) => c.sid) ?? []);
  return tickets
    .filter((b) => b.labels.includes('blocker') && b.number !== number
      && (b.parent?.number === number || b.blocksSids.some((s) => sids.has(s))))
    .map((b) => b.number);
}

export type CloseChoice = 'close' | 'blockers-to-quest' | 'blockers-to-sidequest' | 'close-blockers' | `kind:${string}`;

/** Closes a ticket from the page, after doing what `choice` says with its open blockers. */
export async function closeTicket(number: number, choice: CloseChoice): Promise<void> {
  const R = ['-R', ticketsRepo()];
  const toKind = choice === 'blockers-to-quest' ? 'quest' : choice === 'blockers-to-sidequest' ? 'sidequest'
    : choice.startsWith('kind:') ? choice.slice(5) : null;
  for (const b of openBlockersOf(number)) {
    if (toKind) await gh(['issue', 'edit', String(b), ...R, '--add-label', toKind, '--remove-label', 'blocker']);
    if (choice === 'close-blockers') await gh(['issue', 'close', String(b), ...R]);
  }
  const when = new Date().toLocaleString('sv-SE').slice(0, 16);
  await gh(['issue', 'comment', String(number), ...R, '--body', `Closed from the quests page by ${questsUser()}, ${when}.`]);
  await gh(['issue', 'close', String(number), ...R]);
  await refreshTickets();
}
