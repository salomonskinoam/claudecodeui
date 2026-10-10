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

## What is now fixed, as read

| Point | Ruling |
|---|---|
| Three kinds | quest (a root), sidequest (a non-blocker under a master), blocker (under a master). A quest ranks above a sidequest, always. A blocker ranks above its master. |
| The object | A chat. A spawned chat can message its master and its siblings. |
| Spawning | Manual for now: Noam writes "make a quest", "make a sidequest" or "make a blocker" in his message, with the context the new chat gets. Automatic later. |
| Who splits | Noam, by what he writes. If he does not say it, nothing splits. If he says it, the page asks in a popup before the chat is made. |
| Where it runs | A hook that fires after each enter (each message Noam sends). The hook sends the chat's summary and last turn to an agent. For now that agent only carries out what Noam wrote. The data it receives is saved. |
| The summary | Written by that same agent, after each enter. |
| A blocker's content | Exactly the item as it stands in the master, nothing added. |
| No one-liners | A one-line question is never made into a chat, by Noam or by the agent. |
| Scope | Every spawned chat gets a clear instruction: do not make more work than you were assigned. A hook check for this may come later. |
| Learning | None for now. |
| Ranking between roots | None for now. If needed later: a hand-written ranking list of masters. Then the highest root that needs input comes first, a click (permission prompt) above a text answer (question), together with its blockers. |
| Naming | The master's name plus the item number, for example "oct_09 rag2 axes harness 5.1", set through rename. |

> there has to be a choice with enter or with <something>+enter in the ui to choose if to stay on current chat or draw a new one from the pile. default should be to stay

Ruling, as read: in the page's input box, Enter sends and stays on the chat (the default). A modifier plus Enter sends and then opens the next chat from the top of the queue. The modifier is Alt: today Enter and Ctrl+Enter send, Shift+Enter makes a new line, and Alt+Enter is free. This replaces the "Next" key of decision 5; the "Next" button stays for the case where there is nothing to send.

## Still open after the answers

19. What a spawned chat is and when it runs. Noam's example in point 11: a sidequest that needs data from him, with only that in its context, which "would float sometime later". Two readings. Reading A: the chat is created with its first message in place, does not run, and waits in the queue; it starts when Noam reaches it and answers. No money is spent before he looks. Reading B: the chat starts at once in the background, works until it needs Noam, and then enters the queue. For a blocker, reading B is what makes it short. For a sidequest that needs data from Noam, reading B wastes a run that stops at once. A possible rule: blockers start at once, sidequests wait.

20. The form of a spawned chat. Reading A: a Claude Code session in its own worktree (through the repo's tools/require_worktree.sh), so Cursor can open it, the registry sees it, and it can message its master and siblings with the cross-session tools. Reading B: a chat run from the page's server through the Agent SDK, visible only in the page. Reading A matches "it can communicate with master and siblings", which exists today only between Claude Code sessions.

21. Where the hook lives. The hook must fire in Cursor chats, so it is a Claude Code hook (UserPromptSubmit). Its script can live in the quests repo and be named from the user-level ~/.claude/settings.json, so nothing of quests enters noam_worlds. The script posts the session id, the working directory and the message to the page's server; the server saves them and runs the agent. This is a technical route, chosen here, not a decision for Noam.

18. What changes in the earlier decisions 1 to 8. They assumed the queue unit is a chat with three kinds of wait. The tree adds a fourth kind: a split that is not yet a chat. Decision 1 (which chats enter) and decision 3 (order) are reopened by points 9 and 15. Decisions 2, 4, 5, 6 and 8 stand as asked.
