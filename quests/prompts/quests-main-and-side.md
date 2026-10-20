# Main quests, side quests, and the queue

Noam's statement of what quests must do, 2026-10-09, in the chat that designs the done-chat queue. First verbatim, then disambiguated. The disambiguation is a reading, not a decision; every open point is numbered and waits for Noam.

## Verbatim

> the thing here is to distinguish a main quest from a side quest from a new quest the first quest turned into (and then maybe the quest isn't done but turned into a side quest. these things could be asked from the user for starters, but then it should gradually ask itself why these decisions were made by the user, and draw a shape of what is main and what is side.
> We aspire to have short running chats, and a current issue is that chats take i would estimate 1-2 days each on average, with many running at the same time. so an aspiration is to fine splitting points, insert those to the queue as new quests, and always have a summary attached to any chat, that is updated and has the same format, and can be read at a glance, as the queue just always brings a new chat from the top of the queue. that new chat could be auto initiated, proactivally. it is a chat that was put in the queue due to a split from a main quest for example. why? because some side quests are blockers and some are not. blockers must be prioritized over their master, and non blockers should be prioritized under their masters. See the current way i've had claude talk to me in @.claude/output-styles/noam.md and in claude.md. think why i have it respond in ever growing, tree-like structure. it is so that i can respond, and not lose the thread. it ensures the rag search behind that chat on the token saver will always find each thread in its entirity. this is what i actually need. each such point should be a blocker or a nonblocker, with blockers being short lived chats i can solve individually.

The output style he points to (noam_worlds, `.claude/output-styles/noam.md`) has these rules: number every item; numbers are permanent for the whole chat, never reused, never restarted; split into 5.1, 5.1.1 instead of opening a new number; an item reaches the user only if it blocks the work or already went wrong; a blocking item carries its history with quotes, its context in full names, all the information needed to decide, and one question.

## Terms

| Term | Meaning |
|---|---|
| Ticket | A GitHub issue in salomonskinoam/tickets. The unit of work that leaves a chat. Rules: `~/src/tickets/REQUIREMENTS.md` (commit 8442f98). |
| Quest | A ticket of kind quest: root work, or a chat's own ticket when Noam opened the chat by hand. |
| Sidequest | A ticket that does not block its parent. Ranked below its parent. |
| Blocker | A ticket that blocks the chats named in its "Blocks" section. Ranked above them. Meant to be a short chat Noam solves on its own. |
| Parent | The ticket a ticket hangs under, as a GitHub sub-issue. |
| Ledger item | One numbered point in a chat's reply (1, 5.1, 5.1.1). An item that keeps growing a branch becomes a ticket when Noam says so. |
| Token saver | The retrieval search behind a chat that finds earlier threads by their ledger numbers. The tree shape exists so each thread is found whole. |
| Queue | The ordered list of what needs Noam next. The quests page shows it; Noam always talks to the top one. |

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

## Noam's answers, 2026-10-09, verbatim

> 9. maybe we should start with something like "make a sidequest" or "make a blocker" or "make a quest" with quest taking prio over sidequest, always. the object is a chat but spawning could be automatic or manual. if something has become a chat, it can comminucate with master and siblings. i would expect both to not make one liners into new chats. chats need to have a clear instruction to not make more work than they were assigned. there should be some hook check for it maybe.
>
> 10. the background loop we're building sends the summary and last turn to an agent that decides. this is the wish, for now it can be manual by saying how to split, and we need the data saved.
>
> 11. tbd (for example, this answer would start a new chat with <relevant> context, that is a sidequest (non blocker). Solving it would require data xyz from the user. so that and only that would be in the subchat's context. and after the user clicks enter, that would float sometime later.
>
> 12. human, by context. if not said, they dont split yet. if said, ask in popups.
>
> 13. for now it doesn't. tbd.
>
> 14. the agent spawning chats by a hook after each enter. blocker exactly what's there.
>
> 15. no such ranking exists for now. if it does, we will do a manual ranking list of masters. then the highest root that needs input (and click is higher prio than text) takes prio, with all of its non side quest chats.
>
> 16. i already said at the after submit hook.
>
> 17. good susggestion

> there has to be a choice with enter or with <something>+enter in the ui to choose if to stay on current chat or draw a new one from the pile. default should be to stay

## Current state, 2026-10-20

The ticket system (repo salomonskinoam/tickets, cloned at `~/src/tickets`, commit 8442f98) was built between 2026-10-13 and 2026-10-16 and answers most of the open points above. Its rules, as they bear on quests:

| Point | Rule now | Answers |
|---|---|---|
| The unit split off a chat | A ticket. Noam says "make a quest", "make a sidequest", "make a blocker", "ticket this" or "handle it later"; the ticket-create skill writes it; a hook with a model checks the body before it is created. One point per ticket, never a one-line question. | 9, 10, 12 |
| Automatic splitting or starting | None. Noam says when an item becomes a ticket, and Noam opens chats from tickets. | 10, 16 |
| A chat from a ticket | A Claude Code chat Noam opens with the ticket link in its first prompt. It claims the ticket and works on that one only. | 9 |
| Talking to master and siblings | Every ticket names the chat that opened it (session id, `claude --resume <session id>`). A chat that updates its ticket messages its parent and offspring chats that are live. | 9 |
| Scope | Every ticket has a "Do not" section: a chat makes no more work than it was given. | 9 |
| Depth | A chat working on a sub-ticket that creates another ticket raises a popup first. | 12 |
| The summary | The ticket body: history with Noam's words and dates, context, "Done when", "Do not", "Needs Noam", plus update comments. No per-turn summary hook. | 14 |
| Priority | A blocker ranks above the chats it blocks; a sidequest below its parent; unrelated quests have no ranking. | 15 |
| Naming | Title: the chat name plus a short subject. No chat item numbers anywhere in a ticket. | 17 |
| Where it is stored | GitHub, so it survives a disk failure. | |
| The picture | `python3 ~/src/tickets/forest.py` draws the tree from GitHub alone. | |
| The quests page | "will later read the open tickets as its queue. Not built now." | |

Still standing from this chat: Enter sends and stays on the chat; Alt+Enter sends and opens the next one from the top of the queue (today Enter and Ctrl+Enter send, Shift+Enter makes a new line, Alt+Enter is free). The recap popup is on hold (Claude Code has `/recap`).

## Open for the queue page

22. What the queue holds. Source one: live chats that wait for Noam (permission prompt, question, finished turn), from Claude Code's registry `~/.claude/sessions/*.json`. Source two: open tickets that no chat has claimed, from GitHub. Both, or one.

23. Order. A chat takes its place from the ticket it claimed: blocker above what it blocks, sidequest below its parent. Unrelated quests have no ranking, so a queue still needs a tie rule: Noam's words of 2026-10-09, "click is higher prio than text", give permission prompt, then question, then finished turn; oldest first inside each. A chat with no ticket (one that only answers questions) has no place in the tree.

24. Opening an unclaimed ticket from the page. Cursor's Claude extension accepts `cursor://anthropic.claude-code/open?prompt=<text>`, which opens a new chat with that text; untested whether it only fills the box or also sends. The page would fill it with the ticket link, so the new chat claims the ticket on its first turn.

25. Leaving the queue. A chat leaves when Noam sends it a message; a ticket leaves when a chat claims it. A finished chat with nothing to answer needs a "dismiss" that holds until its next finished turn.
