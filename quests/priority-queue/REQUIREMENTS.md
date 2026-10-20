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

## The requirements, as read

| # | Requirement | Source |
|---|---|---|
| 1 | The queue holds both: chats that wait for Noam (permission prompt, question, finished turn; from Claude Code's registry `~/.claude/sessions/*.json`), and open tickets no chat has claimed (from GitHub). | 22 |
| 2 | Precedence comes from the tickets: a blocker ranks above every chat it blocks; a sidequest ranks below its parent. These relations are never broken. | 23, ticket rules |
| 3 | Entries with no relative ranking get an arbitrary order. That order sticks until the next change. Every change keeps every precedence. | 23 |
| 4 | A live list of the ranking: one line per entry, its name only, the highest priority on top. A directed-forest view comes later. | 23 |
| 5 | Dragging an entry changes its absolute place and never breaks a precedence. With A a blocker of B: B can never go above A, A can never go below B, other entries can go between, above or below them. Dragging A below B carries B along below it; dragging B above A carries A along above it. | 23 |
| 6 | The drag is live while the mouse button is held. Released inside the list: the shown order becomes the order. Released outside: undo, every moved entry goes back to its place. | 23 |
| 7 | A new entry (from the coming automatic machine, or any new ticket or waiting chat) is placed by every precedence that applies to it, and after every existing entry it has no precedence with. | 23 |
| 8 | Every chat in the list has a link that opens it in Cursor: `cursor://anthropic.claude-code/open?session=<session id>`. Not tested yet; no test now. | 24 |
| 9 | Sending a message does not take a chat out of the queue. The page stays on the same chat until Noam asks for the next one. | 25 |
| 10 | A button and the shortcut Alt+Enter "bring me the next one in line": the highest entry that needs Noam opens. If the input box holds text, Alt+Enter first sends it, as Enter does. Plain Enter sends and stays. | 25, 2026-10-09 21:12 |
| 11 | The interface is "the new UI". Not identified yet: see open point 27 below. | 24 |
| 12 | The order is persistent and refreshes fast enough for a live list. Where it is held and how fast: see open point 26 below. | 26 |

## Open

26. What holds the order, and how fast it updates. Proposed to Noam 2026-10-20; not ruled.

27. Which interface "the new UI" is. No new interface exists in this repo or elsewhere under `~/src` (checked 2026-10-20). The one new interface on the machine is the Claude desktop app (package `claude-desktop` 2.26454.2, Claude Code sessions in it since 2026-10-17).

28. How the tie rule of 23 (permission prompt, then question, then finished turn, oldest first) and the sticky order of 23 meet: whether an entry moves when its kind of wait changes, or keeps its place once placed.
