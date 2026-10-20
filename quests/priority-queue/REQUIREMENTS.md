# Priority queue: requirements

The queue decides which chat or ticket needs Noam next. It is shown in the quests page, the fork of CloudCLI UI in this repo (salomonskinoam/claudecodeui, served by `quests-ui.service` on http://localhost:3001). Its entries come from two sources: chats on this machine that wait for Noam, and open tickets in salomonskinoam/tickets that no chat has claimed. The ticket rules are `~/src/tickets/REQUIREMENTS.md` (commit 8442f98); the design history is `quests/prompts/quests-main-and-side.md` in this repo.

## Noam's spec, verbatim

2026-10-20 18:49, answers to the open points of the queue page (point 22: what the queue holds; 23: order; 24: opening an unclaimed ticket from the page; 25: leaving the queue):

> 22.  both sounds ok.
> 23.  you got it right. about things that don't have a relative ranking, i am ok with some arbitrary ranking. But in all cases, that ranking sticks until the following change. The change will adhere to the things that do have a relative ranking.
> I also require a live display of the ranking, for now in a list view with just the task names, with the top being the highest priority. Later we will do a directed-forest view.
> dragging a task in the list changes its absolute priority but never breaks precedences. For example, if A is a blocker for B, I can never drag B to be above A or A to be below B. but I can stick other things between them, above them or below them. Dragging A down below B would drag B along with it and vice versa. This is all while the mouse is clicked. If released in the widget, the shown state will then be the new state. if released out, it will undo and put all dragged items back to their place.
> Another way to change the ordering of tasks is by the auto machine we will soon discuss spawning a new task into the queue. that task will auto sort relative to everything that has relative sorting, and come after everything that doesn't that already exists, as a tie breaker.
> I want all of this spec verbatim in the requirements file of the priority queue on the quests repo.
> 24. we will be working with the new UI. find it so you know what we're talking about. it's probably also on the quests repo, or it should be. so to your answer, no. but i do want every chat list item to have this link to open it in cursor if i want to. no need to test that right now.
> 25. a chat does not leave when i send a message. there should be a button and a keyboard shortcut to "bring me the next one in line". until then we stay in the same chat window. kb shortcut: alt+enter. it also does "submit" if needed (normal enter).
> i do wonder though and want a recommendation [in a new bullet] what will hold the priotity state and how fast will it update. need persistent and fast enough reftesh rate memory for that thing

The proposal "you got it right" accepts, as written to Noam on 2026-10-20 18:22: "A chat takes its place from the ticket it claimed: above what it blocks, or below its parent. Unrelated quests have no ranking, but a queue still needs a rule for ties. On 2026-10-09 you wrote "click is higher prio than text". So the rule would be: permission prompt first, then question, then finished turn, and oldest first inside each group."

Earlier rulings that still stand, verbatim:

> 2026-10-09 21:07: no such ranking exists for now. if it does, we will do a manual ranking list of masters. then the highest root that needs input (and click is higher prio than text) takes prio, with all of its non side quest chats.

> 2026-10-09 21:12: there has to be a choice with enter or with <something>+enter in the ui to choose if to stay on current chat or draw a new one from the pile. default should be to stay

2026-10-20 19:18, verbatim:

> the list of priorities is actually a forest: roots have no ordering between them (so one is assigned arbitrarily, and then that is the order) and then it's a tree.
> if a root is done before its child(ren), they both become roots. side quests keep their status and are always under quests. but root priority takes precedence over quest type, and even if the root is done, the children keep its relative priority.
>
> 24. we used an open source claude code wrapper library and updated it
> so it probably makes sense to represent this as a tree rather than as a forest. it's in ../quests/claudecodeui this is our updated fork.
>
> 26. local plus mirror clearly.
>
> 27. find it. i said above
>
> 28. there needs to be enforcement that each chat always ends on either "waiting for <what>" (and get a queue place when that returns) or "question <what> with background and history like today". or "blocker <what>". otherwise chats are expected to be independent. This requirement is tricky because it involves the harness, and we want to separate the part of the harness that is used for the prio queue from the one that's business logic.
> permission prompt is above tree order, it is always highest prio.
> so yes, kind of wait it what tie breaks waiters within a priority.
> as i said, the only thing a user can change is the relative prio between roots, but not inside the family (unless changing quest type) and not between priorities.
> 29 so you're supposed to understand i got it wrong and meant salimonskinoam bro

(29 was about the GitHub account of this repo's remote; the remote is salomonskinoam/claudecodeui, which is the account meant.)

## The requirements, as read

| # | Requirement | Source |
|---|---|---|
| 1 | The queue holds both: chats that wait for Noam (from Claude Code's registry `~/.claude/sessions/*.json`), and open tickets no chat has claimed (from GitHub, salomonskinoam/tickets). | 22 |
| 2 | The order is a forest. A root is a ticket with no open parent (or a chat with no ticket). Roots have no order between them: each gets an arbitrary place when it appears, and that place sticks. | 19:18 |
| 3 | Inside a tree the order follows the ticket kinds: a blocker ranks above the chats it blocks; a sidequest ranks below its parent; side quests are always below quests. | 23, 19:18, ticket rules |
| 4 | The root's place comes before the kind: everything in a higher tree ranks above everything in a lower tree, whatever its kind. | 19:18 |
| 5 | When a root is done (its ticket closed) before its children, the children become roots. They keep the done root's place among the roots, in their order inside that place (quests above side quests). | 19:18 |
| 6 | A permission prompt ranks above the whole tree order: a chat waiting on a permission prompt is always first. | 28 |
| 7 | Entries with the same priority are ordered by kind of wait: permission prompt, then question, then finished turn; oldest first inside each. | 23, 28 |
| 8 | Noam can change one thing: the order between roots. Never the order inside a family (except by changing a ticket's kind, which moves it by rule 3), and never across the levels of rules 6 and 7. | 28 |
| 9 | Dragging a root moves its whole tree. The drag is live while the mouse button is held. Released inside the list: the shown order becomes the order. Released outside: undo, every moved entry goes back to its place. | 23, 28 |
| 10 | A new entry (a new ticket, a newly waiting chat, or one from the coming automatic machine) is placed by rules 3 to 7; a new root goes after every existing root. | 23 |
| 11 | A live display of the order: one line per entry, its name only, the highest priority on top. A directed-forest view comes later. | 23 |
| 12 | Every chat in the list has a link that opens it in Cursor: `cursor://anthropic.claude-code/open?session=<session id>`. Not tested yet; no test now. | 24 |
| 13 | Sending a message does not take a chat out of the queue. The page stays on the same chat until Noam asks for the next one. | 25 |
| 14 | A button and the shortcut Alt+Enter "bring me the next one in line": the highest entry that needs Noam opens. If the input box holds text, Alt+Enter first sends it, as Enter does. Plain Enter sends and stays. | 25, 2026-10-09 21:12 |
| 15 | Every chat ends each turn on exactly one of three: "waiting for <what>" (no queue place; it gets one when the awaited thing returns), "question <what>" with background and history as in the output style's gate items, or "blocker <what>". This is enforced. | 28 |
| 16 | The enforcement belongs to the queue's part of the harness, kept apart from the harness of the business logic (the noam_worlds repo's `.claude/` and `sdk/plugins/hor/`). | 28 |
| 17 | The order is held in a local database in the quests server, the working copy, read by the page with no delay; every change is mirrored to GitHub within seconds and restored from there after a disk loss. | 26 |
| 18 | The interface is the quests page: this repo, the updated fork of CloudCLI UI ("we used an open source claude code wrapper library and updated it"). | 24, 27 |
