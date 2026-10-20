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

2026-10-20 20:11, verbatim:

> unclear from your rules: a permission prompt is also above the root priority. so permission of low prio is still above anything else of high prio.
>
> dragging a root *can* move its whole tree. it happens only if the thing being dragged is trying to go above or below something else that would break internal order. so "the block gets bigger" and you drag further, and it drags as a block.
>
> in the thing showing the order in the ui, each tree from a root should have its different, auto generated color.
>
> 30. it doesn't seem we can use 2 styles together.
>
> i do think it's better to separate and add a third last line for the queue, and a hook to not allow a response to pass without it in the text. if it's not there, return to the chat with the issue and the instructions of how to talk.
>
> the session list should keep showing as a list. the projects are a poor attempt at what we're doing- we're overriding this. so there, it should be a list, flat, with things from the same root with the same background color.
>
> then, there will be a SEPARATE widget, showing a forest, horizontal, with the top level being the different roots, and each one collapsable or openable when you click a node. each node will highlight its corresponding list item on hover and vice versa, and on click it will be the same as on click on the list item (open it). on hover will show the name of the ticket. to uncollapse or collapse, it's another small button per node.
>
> are you putting all of this in the ticket verbatim? this is the entire design so keep it

(30 was about how the end-of-turn rule is written: reuse the two closing lines of the noam_worlds output style, or a separate line owned by the queue.)

2026-10-20 20:22, verbatim (answers to: what a chat ends on when its work is finished; whether "blocker <what>" opens a ticket by itself; where a child ticket of kind quest ranks in its family):

> when finished it should end on Done <what>
> blocker nor anything else opens a ticket by itself. we are not there yet.
> a child of kind quest is not a child. it is a root quest. it should be linked to the parent, but that does not make it a part of the family. the auto rank it should get is below the rank of the parent, meaning last after everything.

## The requirements, as read

### Sources

| # | Requirement | Source |
|---|---|---|
| 1 | The queue holds both: chats that wait for Noam (from Claude Code's registry `~/.claude/sessions/*.json`), and open tickets no chat has claimed (from GitHub, salomonskinoam/tickets). | 22 |
| 2 | The interface is the quests page: this repo, the updated fork of CloudCLI UI ("we used an open source claude code wrapper library and updated it"). | 24, 27 |

### The order

| # | Requirement | Source |
|---|---|---|
| 3 | The order is one list over all entries. It is shaped by a forest. A root is a ticket of kind quest, or a ticket with no open parent, or a chat with no ticket. A ticket of kind quest is always a root, also when it has a parent: it stays linked to that parent, but it is not part of the parent's family. Roots have no order between them: each gets an arbitrary place when it appears, and that place sticks. | 19:18, 20:22 |
| 4 | A family is a root and the blockers and side quests under it. Inside a family the order follows the ticket kinds and never changes by hand: a blocker ranks above the chats it blocks; a side quest ranks below its parent; side quests are always below quests. Changing a ticket's kind moves it by this rule. | 23, 19:18, 28, 20:22, ticket rules |
| 5 | The kind orders only inside a family. Between families only the place of the roots counts: a side quest of a higher root can rank above a quest of a lower root ("root priority takes precedence over quest type"). | 19:18 |
| 6 | When a root is done (its ticket closed) before its children, the children become roots. They keep the done root's place, in their order inside that place (quests above side quests). | 19:18 |
| 7 | A permission prompt ranks above everything: a chat waiting on a permission prompt in the lowest family ranks above every entry of the highest family. | 28, 20:11 |
| 8 | Entries with the same priority are ordered by kind of wait: permission prompt, then question, then finished turn; oldest first inside each. | 23, 28 |
| 9 | Noam changes one thing by hand: the place of a root. Never the order inside a family, and never across the levels of rules 7 and 8. | 28 |
| 10 | Dragging a root moves the root alone. Entries of other families may end up between members of its family, above them or below them. When the root would pass a member of its own family that must stay on the other side, that member joins the dragged block; the block grows each time and moves on as one block. | 23, 20:11 |
| 11 | The drag is live while the mouse button is held. Released inside the widget: the shown order becomes the order. Released outside: undo, every moved entry goes back to its place. | 23 |
| 12 | A new entry (a new ticket, a newly waiting chat, or one from the coming automatic machine) is placed by rules 4 to 8; a new root goes after every existing root, last. This holds for a new quest with a parent too: it goes last, below its parent and below everything else. | 23, 20:22 |
| 13 | The order is held in a local database in the quests server, the working copy, read by the page with no delay; every change is mirrored to GitHub within seconds and restored from there after a disk loss. | 26 |

### The display

| # | Requirement | Source |
|---|---|---|
| 14 | The session list stays a list: flat, one line per entry, name only, in queue order, the highest priority on top, live. The projects grouping of CloudCLI UI is replaced by it ("the projects are a poor attempt at what we're doing- we're overriding this"). | 23, 20:11 |
| 15 | Every family has its own color, generated automatically. In the session list, every entry of a family has that color as its background. | 20:11 |
| 16 | A separate widget shows the forest, horizontal, the roots on the top level. Each node has a small button that collapses or opens it. Clicking a node opens its chat, the same as clicking its line in the list. Hovering a node shows the ticket's name and highlights its line in the list; hovering a line highlights its node. | 20:11 |
| 17 | Every chat in the list has a link that opens it in Cursor: `cursor://anthropic.claude-code/open?session=<session id>`. Not tested yet; no test now. | 24 |

### Using it

| # | Requirement | Source |
|---|---|---|
| 18 | Sending a message does not take a chat out of the queue. The page stays on the same chat until Noam asks for the next one. | 25 |
| 19 | A button and the shortcut Alt+Enter "bring me the next one in line": the highest entry that needs Noam opens. If the input box holds text, Alt+Enter first sends it, as Enter does. Plain Enter sends and stays. | 25, 2026-10-09 21:12 |

### The end of every turn

| # | Requirement | Source |
|---|---|---|
| 20 | Every reply of every chat ends with a third last line owned by the queue, after the output style's own two closing lines: "waiting for <what>" (no queue place; it gets one when the awaited thing returns), "question <what>" with background and history as in the output style's gate items, "blocker <what>", or "Done <what>" when the chat's work is finished. | 28, 30, 20:22 |
| 21 | A hook lets no reply pass without that line. A reply without it goes back to the chat with what is missing and the instructions for the line. | 30 |
| 22 | The line and its hook belong to the queue's part of the harness, kept apart from the harness of the business logic (the noam_worlds repo's `.claude/` and `sdk/plugins/hor/`). Two output styles cannot be active at once, so the queue's instructions do not come as an output style. | 28, 30 |

| 23 | Nothing opens a ticket by itself: not a "blocker" ending, not anything else. Tickets are opened only when Noam says so, as the ticket rules say. | 20:22 |
