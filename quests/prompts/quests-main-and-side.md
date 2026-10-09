# Main quests, side quests, and the queue

Noam's statement of what quests must do, 2026-10-09, in the chat that designs the done-chat queue. First verbatim, then disambiguated. The disambiguation is a reading, not a decision; every open point is numbered and waits for Noam.

## Verbatim

> the thing here is to distinguish a main quest from a side quest from a new quest the first quest turned into (and then maybe the quest isn't done but turned into a side quest. these things could be asked from the user for starters, but then it should gradually ask itself why these decisions were made by the user, and draw a shape of what is main and what is side.
> We aspire to have short running chats, and a current issue is that chats take i would estimate 1-2 days each on average, with many running at the same time. so an aspiration is to fine splitting points, insert those to the queue as new quests, and always have a summary attached to any chat, that is updated and has the same format, and can be read at a glance, as the queue just always brings a new chat from the top of the queue. that new chat could be auto initiated, proactivally. it is a chat that was put in the queue due to a split from a main quest for example. why? because some side quests are blockers and some are not. blockers must be prioritized over their master, and non blockers should be prioritized under their masters. See the current way i've had claude talk to me in @.claude/output-styles/noam.md and in claude.md. think why i have it respond in ever growing, tree-like structure. it is so that i can respond, and not lose the thread. it ensures the rag search behind that chat on the token saver will always find each thread in its entirity. this is what i actually need. each such point should be a blocker or a nonblocker, with blockers being short lived chats i can solve individually.

The output style he points to (noam_worlds, `.claude/output-styles/noam.md`) has these rules: number every item; numbers are permanent for the whole chat, never reused, never restarted; split into 5.1, 5.1.1 instead of opening a new number; an item reaches the user only if it blocks the work or already went wrong; a blocking item carries its history with quotes, its context in full names, all the information needed to decide, and one question.

## Terms, as read

| Term | Reading |
|---|---|
| Quest | One unit of work. It lives in one chat. One chat is one quest. |
| Main quest | A quest Noam opened himself. The root of a tree. |
| Master | The quest a side quest was split from. Its parent in the tree. |
| Side quest | A quest split off from a master. It runs in its own chat. It has exactly one master. |
| Blocker | A side quest its master cannot continue without. Ranked above its master. Meant to be short. Noam solves it on its own. |
| Non-blocker | A side quest its master does not wait for. Ranked below its master. |
| Turned-into quest | A chat whose goal changed. The old goal is then either finished, or it became a side quest of the new goal. |
| Splitting point | A moment in a chat where a piece of work can become its own quest. |
| Ledger item | One numbered point in a chat's reply (1, 5.1, 5.1.1). The tree Noam answers against. |
| Summary | A short card on every chat, always the same format, kept up to date, readable at a glance. |
| Queue | The ordered list of quests. Noam always talks to the top one. |
| Auto-initiated chat | A chat the system starts on its own, from a split, before Noam asks for it. |
| Token saver | The retrieval search behind a chat that finds earlier threads by their ledger numbers. The tree shape exists so each thread is found whole. |

## Shape, as read

1. Quests form a tree. Main quests are roots. Side quests hang under their master. A chat may have several side quests.
2. The queue is a walk over that tree with a rule: a blocker comes before its master; a non-blocker comes after its master.
3. The ledger item is the natural splitting point. A reply's numbered item that blocks the work is a blocker candidate; an item that is informational or a later improvement is a non-blocker candidate.
4. Short chats are the goal. Today a chat lasts 1 to 2 days. Splitting at ledger items is how a chat gets short: a blocker becomes its own chat that Noam clears in one sitting.
5. The summary makes switching cheap. Because the queue sends Noam to a chat he has not seen for a while, every chat carries a summary of the same shape. The summary is the thing read at a glance, before the chat itself.
6. Main versus side is first ruled by Noam. The system records each ruling with the state it was taken in. Over time it proposes the ruling itself, from the pattern of past rulings, and asks less.

## Open points

These continue the numbering of the chat ledger (1 to 8 were the queue decisions; 7 is on hold with the recap).

9. The unit in the queue. "each such point should be a blocker or a nonblocker, with blockers being short lived chats i can solve individually." Reading A: every blocking ledger item becomes its own chat, so the queue unit is a chat and the master's reply only points to it. Reading B: the queue unit is the ledger item itself; it points into the master chat, and only some items become chats. Reading A makes every blocker a chat, even a one-line question. Reading B keeps one-line questions inside the master and makes the queue a list of items, not chats.

10. Who finds the splitting points, and when. Candidates: the chat itself when it writes a numbered item (the item is marked blocker or non-blocker at birth, by the output style); the page, by reading the transcript after each turn; a manager chat (feature row 35). The first needs a change to the output style and CLAUDE.md in noam_worlds, nothing in quests. The second needs a parser of ledger items in the quests server. The third is a larger build.

11. The "turned into" case. When a chat's goal changes, which chat keeps the transcript. Reading A: the same chat continues under the new goal, and the old goal is recorded as finished or as a side quest. Reading B: a new chat is opened for the new goal, and the old chat becomes its side quest or is closed. Reading A keeps context in one place. Reading B keeps chats short.

12. How Noam rules main versus side "for starters". Candidates: a question in the chat itself (the chat asks "is this a blocker?" as a ledger item); a control in the page on the queue row (blocker / non-blocker / main); a word in the reply ("5.1 blocker"). The ruling must be stored with enough state for the later pattern (what the item was, what the master was doing, what Noam chose).

13. How the system "asks itself why". Candidates: a written policy file that grows one line per ruling, read by Claude when it proposes; a plain rule set (for example: an item that names a missing approval is a blocker, an idea is a non-blocker) that is edited by hand; a model call over past rulings. Only the first two are inspectable.

14. The summary. "always have a summary attached to any chat, that is updated and has the same format". Who writes it: the chat itself at the end of each turn (a hook, written into the transcript); the page, with a model call (this is the recap now on hold, in a standing form); Noam never. What it holds: a fixed form such as goal, where it stands, what is asked of Noam, open blockers. Whether the Claude Code recap (`/recap`, the `away_summary` line in the transcript) is that summary or not.

15. Ranking between unrelated roots. Blocker above master and non-blocker below master order one tree. Between two main quests the earlier decision 3 still applies (oldest waiting first, or blocked chats first).

16. Auto-initiated chats. "that new chat could be auto initiated, proactivally". What starts it (the page's server, a manager chat), what it is (a page-run chat, or a Claude Code chat in a worktree so the registry sees it), what its first message is (the summary of the split point plus the master's ledger item verbatim), and which permission mode it runs in. A chat that starts by itself can spend money; the rule in noam_worlds is that billed steps need Noam's go.

17. Naming. A side quest born from ledger item 5.1 of chat "oct_09 rag2 axes harness" needs a name the token saver can find. Candidate: the master's name plus the item number ("oct_09 rag2 axes harness 5.1"). The chat's rename is the one place the page already reads names from.

18. What changes in the earlier decisions 1 to 8. They assumed the queue unit is a chat with three kinds of wait. The tree adds a fourth kind: a split that is not yet a chat. Decision 1 (which chats enter) and decision 3 (order) are reopened by points 9 and 15. Decisions 2, 4, 5, 6 and 8 stand as asked.
