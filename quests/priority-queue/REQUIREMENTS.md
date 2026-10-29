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

2026-10-20 20:35, verbatim (6 and 20 and 23 are the rule numbers of the table below at commit 4513156):

> 6. if a root is done when it still has blockers, a popup should come up with are you sure and an explanation of what's currently flagged as blocker. options: "yes", "convert to quest, side quest, close the blocker too, other <type>"
> 20. right. blockers are always from this chat + the ticket blockers.
> 23.

2026-10-20 20:50, verbatim (20.1 and 23 are rules of the table below at commit ffae817; 33 asked where the popup of rule 6.1 comes up: in the chats, in the quests page, or both):

> 20.1 no, it should only name open blockers. we shouldn't spam closed tickets, that's the whole point of all of this. add to the philosophy
> 23.ok
> 33.  ok

2026-10-20 21:05, verbatim:

> 33. both

2026-10-21 17:46, verbatim (answers to open points 35 to 38 below):

> 35. seems alright
> 36. no, it should open a new chat with some basic text typed in "we are starting this ticket <link>"
> and let the user go on from there.
> it should show also a clickable link to the ticket.
> 37.  good idea. is it always detectable that the chat is now open in cursor?
> 38. sure let's do it that way for now

2026-10-21 22:19, verbatim:

> important req: if the user didn't click enter on a chat, but that chat was unfocused in favor of another chat manually selected, the current chat goes to the top of the queue, but still after permission requests

2026-10-21 22:26, verbatim (34: how the four endings of rule 20 map to the queue; 37: the page shows a chat open in another editor read-only, detected from Claude Code's registry and Cursor's saved tab list; 39: which folder a new chat from a ticket starts in; 40: how rule 18.3 meets the family order and how long the chat stays on top, options A the chat alone, B its family moves with it as a block, C only as far as the family allows):

> 34. correct
> 37 sounds good
> 39 The parent chat's folder. and it's always going to be noam_worlds most likely
> 40 that is correct because the user chose this chat so it becomes on top. possible to release the "on top latch". there is only one chat on top. if released, it goes to its location in the queue. and all of that is still with option B that it moves while preserving family rules. but it doesn't move family members if no rules were broken.
>
> req: all chats should notify their immediate family if they exist, about events that happen to them. best added in some instruction file. but i want the req documented.

2026-10-21 22:47, verbatim (41: what "immediate family" and "events" cover in rule 24; proposed: family is the parent chat and the child chats; events are every new closing line of rule 20 and every ticket update; a live chat gets a message, a chat that is not live a comment on its ticket; the home is the queue's instruction text of rule 22):

> 41 is fine. family is parents siblings and immediate children

2026-10-22 19:43, verbatim (given while reviewing the plan, `quests/priority-queue/PLAN.md`):

> when creating a chat, i want it named "<mm_dd> <world> <2 word objective> #<ticket num>

2026-10-23 14:30, verbatim (answers to the open decisions of `quests/priority-queue/PLAN.md`: 1 where the forest widget sits, proposed under the list; 2 the closing-line hook allows one retry; 3 a close button in the page):

> 1. remove any logos to save realestate. it should sit above the list view (on the right) of the chats.
> 2. ok
> 3.
>
> I also want when a higher prio chat is ready for action and we are active on a lower prio chat, the new one should blink to say it's ready and more important

2026-10-26 10:03, verbatim (answers to the open decisions of `quests/priority-queue/PLAN.md`: 3 a close button on ticket lines in the page; 4 when a chat with no ticket counts as finalized; 5 family messages only when the kind of the closing line changes; 6 the closing-line hook goes live after its check; 7 who writes the two-word objective of a chat name; 8 how "New Session" chats are named):

> 3. yes
> 4. finalization is always user initiated, so i am not really following the question.
> 5. AND when the user says to notify family
> 6. ok
> 7. popup to ask the user, and an ability for the user to say "let haiku choose". but the format should always be kept.
> 8. they should also get a name by the format, and just let the user name them at the start right after asking about the worktree

2026-10-26 21:41, verbatim:

> claimed tickets (with chats) should always take precedence in the queue over not claimed ones, even if they are side quests over blockers or quests.
> meaning live chats that are not closed take precedence over tickets.
> which is why i expected to see 5 chats on the top of the queue

2026-10-26 21:56, verbatim (about ticket 7, "oct_12 Argus and rubrics before delivery", still open on GitHub while its chat was finalized on 2026-10-14):

> so it should be demoted back to a ticket level and the priority rule should demote closed chats back to ticket level if they were not closed

2026-10-26 22:02, verbatim (answer to 67: should chats open as tabs in the page join the queue):

> 67. makes no sense. open chats are by definition top of the queue, it was a rule wasn't it? they jump on top because the user chose to open them.
>
> also, hover on the list items or tree should show the chat NAME not whatever it is that is shown right now

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
| 6 | When a root is done (its ticket closed) before its children, the children become roots. They keep the done root's place, in their order by rule 4. | 19:18 |
| 6.1 | Closing a root that still has open blockers raises a popup first: "are you sure", with an explanation of what is flagged as its blockers. The options: "yes"; convert the blockers to quests; convert them to side quests; close the blockers too; other (a kind Noam types). The popup comes up both in the chats (the ticket-work close step and the finalize-chat skill, in salomonskinoam/tickets) and in the quests page. | 20:35, 21:05 |
| 7 | A permission prompt ranks above everything: a chat waiting on a permission prompt in the lowest family ranks above every entry of the highest family. | 28, 20:11 |
| 7.0 | A chat open as a tab in the page or in Cursor is in the queue. Being open does not move it. The button "Sync from Cursor" puts the chats open in Cursor on top of the stored order, in Cursor's tab order, each with its family block as a drag does, releases the latch, and makes them the page's left tabs, showing the first. Noam: "the open in cursor is just to start this queue. let's add a button "sync from cursor" so it can always be clear. what's open in cursor will jump on top this way"; "nothing happened to the tabs (didn't open tabs to fit cursor)". | 27 Oct |
| 7.0.1 | The list has three groups, top to bottom, with a separator line between them: the chats open right now (a live Claude Code process, or a Claude tab in Cursor); the chats that were closed without /finalize-chat, with the tickets they claimed; the tickets no chat has claimed. The pinned chat (rule 18.3) is first, above every group and above the permission prompts. Noam: "i want a SEPARATOR in the list: above it, the chats that are actually open right now. below it, chats that are not open and tickets"; "i now want a second separator for chats that were not finalized, but were closed. these should be on the second group, after the currently open chats." | 27 Oct |
| 7.0.2 | Every line's name starts at the same place; a chat with no ticket keeps an empty slot for the kind sign. Noam: "the indents make it seem like everything is under oct_09 priority queue, but that's obviously false". | 27 Oct |
| 7.1 | Below the pinned chat, the permission prompts and the open chats of rule 7.0.1, every entry with a chat (a claimed ticket, or a chat with no ticket) ranks above every ticket no chat has claimed, whatever the kinds: a claimed side quest ranks above an unclaimed blocker or quest. The family rules order entries only inside each of these two levels. | 26 Oct 21:41 |
| 7.2 | A claim by a closed chat (one that ran /finalize-chat) does not count. A ticket still open whose chat was closed drops back to the ticket level of rule 7.1, as a ticket no chat has claimed; clicking it starts a new chat for it. | 26 Oct 21:56 |
| 8 | Entries with the same priority are ordered by kind of wait: permission prompt, then question, then Done; oldest first inside each. | 23, 28, 34 |
| 9 | Noam changes one thing by hand: the place of a root. Never the order inside a family, and never across the levels of rules 7 and 8. | 28 |
| 10 | Dragging a root moves the root alone. Entries of other families may end up between members of its family, above them or below them. When the root would pass a member of its own family that must stay on the other side, that member joins the dragged block; the block grows each time and moves on as one block. | 23, 20:11 |
| 11 | While a line is dragged the list stays still; a blue line shows where it will land. Released inside the list: it lands there, its family block growing as rule 10 says. Released outside: nothing moves. Noam: "dragging behavior causes a lot of blinking. we want dragging a chat in the list to create a line of where that chat is going to land and that should prevent blinking." | 27 Oct |
| 12 | A new entry (a new ticket, a newly waiting chat, or one from the coming automatic machine) is placed by rules 4 to 8; a new root goes after every existing root, last. This holds for a new quest with a parent too: it goes last, below its parent and below everything else. | 23, 20:22 |
| 12.1 | The list holds every open ticket and every chat that has a ticket or a live process, in queue order; "bring me the next one in line" skips the entries that do not need Noam. A chat leaves when its ticket is closed, or, with no ticket, when Noam finalizes it (finalizing is always his call: the chat runs /finalize-chat). A chat's state is read from its last closing line in its transcript, so a chat whose editor tab was closed keeps its place. | 21 Oct 17:46, 26 Oct 10:03 |
| 13 | The order is held in a local database in the quests server, the working copy, read by the page with no delay; every change is mirrored to GitHub within seconds, as one file in the private repository salomonskinoam/tickets ("for now"), and restored from there after a disk loss. | 26, 21 Oct 17:46 |

### The display

| # | Requirement | Source |
|---|---|---|
| 14 | The session list stays a list: flat, one line per entry, name only, in queue order, the highest priority on top, live. The projects grouping of CloudCLI UI is replaced by it ("the projects are a poor attempt at what we're doing- we're overriding this"). | 23, 20:11 |
| 14.1 | A line's text tells a chat from a ticket. A chat reads its name (the "<mon_dd> <world> <objective>" name when it has one, else whatever its name is). A ticket reads "#<number> <title>", the number being its GitHub link, in the list and in the forest. Noam: "i want chats to have the date format like always (or whatever the name is if not in that format by the chat name) and for tickets to have their ticket number with #<> <name>. currently i dont understand what's a chat and what's a ticket". | 27 Oct |
| 15 | Every family has its own color, generated automatically. In the session list, every entry of a family has that color as its background. Ten strongly different colors. A family's color is static: once given, it never changes, whatever moves or arrives (it is saved in the browser). A new family takes the color worn by the fewest families; the open chats come first and weigh most, so they stay apart. Past ten families, the next ones get a lighter shade of a worn color (each color has three shades, thirty in all). When the family on a color's darkest shade is gone, the family on its next shade takes the darkest shade; the hue never changes. Noam: "the colors are not distinct enough. unrelated things seem to be the same color."; "colors of chats in the list view should be static. when i move them around or new ones get added all colors change and it's impossible to keep track of."; "notice they should still be distinct"; "when too many colors: use a different shade of that color to at least give some difference"; "promote secondary colors to primary colors when the primary is done." | 27 Oct, 28 Oct |
| 15.1 | Everything is safe when things happen at the same time: an older answer never replaces a newer one in the page, two page windows each keep their own tabs in the queue, and one mirror write runs at a time. Noam: "this whole thing should be concurrency resistent in case things happen at the same time". | 27 Oct |
| 16 | A separate widget shows the forest, horizontal, the roots on the top level. Each node has a small button that collapses or opens it. Clicking a node opens its chat, the same as clicking its line in the list. Hovering a node shows the ticket's name and highlights its line in the list; hovering a line highlights its node. | 20:11 |
| 16.0 | The forest widget sits above the list of chats, in the right sidebar. Logos are removed there to save room. | 23 Oct 14:30 |
| 16.1 | Every entry for a ticket shows a clickable link to the ticket's GitHub page. | 21 Oct 17:46 |
| 16.2 | Every ticket line has a "close" button. It raises the popup of rule 6.1 when the ticket is a root with open blockers. | 26 Oct 10:03 |
| 16.3 | Hovering a line or a forest node shows the chat's name (rename, else Claude's title); a ticket no chat has claimed shows the ticket title. | 26 Oct 22:02 |
| 16.4 | The hover is one state shared by the list, the forest and the tab rows: hovering any of the three lights the same entry in all three, with the same look. Noam: "hightlighting should highlight all 3 places. currently hovering the tabs highlights the tree and list but not vice versa. they should always all go together and show the same state". | 27 Oct |
| 16.5 | The shown chat (the active tab) hovers like any other, and is marked as shown in all three places: on its line and its forest node a thick blue bar on the left and bold white text; its line in the list also bulges 12 px to the left, past the other lines (8 px first; Noam, 28 Oct: "make the bulge bigger"); its tab bulges above the row and wears a blue frame, with the red bottom edge kept. Noam, 28 Oct: "i also want the list view to bulge the active chat to the left to be clearer". Noam: "the currently selected tab is: 1. not highlights the tree and list and itself on hover. being selected shouldn't change this normal behavior 2. is not showing it's the current tab clearly on the list and tree EVEN THOUGH it's always the first one 3. is not highlighted enough in the tab bar. I want the active tab to have a bulge from the tab bar too, and to have a frame, not just the bottom line". | 27 Oct |
| 17 | Every chat in the list has a link that opens it in Cursor: `cursor://anthropic.claude-code/open?session=<session id>`. Not tested yet; no test now. | 24 | Every chat tells its immediate family, if it has one, about the events that happen to it. Immediate family: its parent chat (the chat that opened its ticket), its sibling chats (the chats on the other sub-tickets of the same parent ticket), and its immediate children (the chats on its ticket's own sub-tickets, the linked root quests of rule 3 included). Events: a change of the kind of the closing line of rule 20 (waiting for, question, blocker, Done), every ticket update (a commit, a push, an eval, a decision), and every time Noam says to notify the family. A live chat gets a message; a chat that is not live gets a comment on its ticket. The home is the queue's instruction text of rule 22. | 22:26, 22:47, 26 Oct 10:03 |

### Using it

| # | Requirement | Source |
|---|---|---|
| 18 | Sending a message does not take a chat out of the queue. The page stays on the same chat until Noam asks for the next one. | 25 |
| 18.1 | Clicking a ticket that no chat has claimed opens a new chat in the page with the text "we are starting this ticket <link>" typed into its input box, not sent; Noam goes on from there. The new chat starts in the folder of the chat that opened the ticket (its session id is in the ticket's "Parent chat" section); almost always the noam_worlds repo. | 21 Oct 17:46, 22:26 |
| 18.1.1 | Every chat is named "<mon_dd> <world> <2 word objective>", plus " #<ticket number>" when it comes from a ticket; for example "oct_22 quests priority queue #32". The format is always kept. A popup asks Noam for the name; it offers "let Haiku choose". Every chat asks right after the worktree question at its start; a chat from a ticket adds " #<ticket number>". | 22 Oct 19:43, 26 Oct 10:03, 26 Oct 15:14 |
| 18.2 | A chat that is open in another editor (Cursor, the Claude desktop app, a terminal) is shown in the page read-only, with its "Open in Cursor" link; Noam answers it there. Two processes on one transcript break a chat. Detected from two signals: a live process for the chat in Claude Code's registry `~/.claude/sessions/*.json`, and the chat's entry in Cursor's saved tab list (`~/.config/Cursor/User/workspaceStorage/<id>/state.vscdb`, key `Anthropic.claude-code`, field `panelTabSessions`). | 21 Oct 17:46, 22:26 |
| 18.3 | The pin, manual only. Every chat line carries a pin icon on hover; the pinned chat shows it always. Click: the chat is pinned, first in the queue, above everything, permission prompts included. Click again: unpin, and the chat goes back to its place in the queue. One pinned chat at a time; pinning another sends the previous one back to its place. Nothing pins a chat by itself: leaving a chat without sending it a message no longer pins it (that was the "on top latch" of 21 Oct, dropped 28 Oct). Noam, 28 Oct: "i want also a pin icon to pin or unpin the top chat. currently i just see X release from the top but unclear how to pin. replace the icon and have a pin icon. it overrides any prio."; "pin should be only manual. auto pinning is confusing." | 21 Oct 22:19, 22:26, 28 Oct |
| 18.4 | The pinned chat moves alone: it is first, and nothing else moves for it; the family rules do not pull its blockers or its parent above it, since the pin overrides any priority. | 22:26, 28 Oct |
| 18.5 | When a chat ranked higher than the chat Noam is on becomes ready for him, its line blinks: it is ready and more important. | 23 Oct 14:30 |
| 19 | A button and the shortcut Alt+Enter "bring me the next one in line": the highest entry that needs Noam opens. If the input box holds text, Alt+Enter first sends it, as Enter does. Plain Enter sends and stays. | 25, 2026-10-09 21:12 |

### The end of every turn

| # | Requirement | Source |
|---|---|---|
| 20 | Every reply of every chat ends with a third last line owned by the queue, after the output style's own two closing lines: "waiting for <what>" (no queue place; it gets one when the awaited thing returns), "question <what>" with background and history as in the output style's gate items, "blocker <what>", or "Done <what>" when the chat's work is finished. | 28, 30, 20:22 |
| 20.0 | The endings decide the queue place: "question" and "Done" give the chat a place; "waiting for" gives none until the awaited thing returns; "blocker" gives none, its open blockers carry the priority. | 34 |
| 20.1 | A "blocker <what>" ending names only the open blockers of the chat: the open ones raised in the chat itself, plus the open blocker tickets that name it. Closed blockers are never named ("we shouldn't spam closed tickets, that's the whole point of all of this"; written into the tickets repo's philosophy.md, salomonskinoam/tickets commit 439802f). | 20:35, 20:50 |
| 21 | A hook (live once its check passes) lets no reply pass without that line. A reply without it goes back to the chat with what is missing and the instructions for the line, once; the second try passes, so a chat cannot loop forever. | 30, 23 Oct 14:30 |
| 22 | The line and its hook belong to the queue's part of the harness, kept apart from the harness of the business logic (the noam_worlds repo's `.claude/` and `sdk/plugins/hor/`). Two output styles cannot be active at once, so the queue's instructions do not come as an output style. | 28, 30 |
| 23 | Nothing opens a ticket by itself: not a "blocker" ending, not anything else. Tickets are opened only when Noam says so, as the ticket rules say. | 20:22 |

### The family

| # | Requirement | Source |
|---|---|---|
| 24 | Every chat tells its immediate family, if it has one, about the events that happen to it. Its home is an instruction file the chats read. | 22:26 |
| 25 | A tab's title is the chat's name (the rename, else Claude's title), the same name the list and the forest show. It never becomes a message Noam wrote. Noam, 28 Oct: "the tab title changes to the last thing I wrote to it instead of remaining the name of the chat. that's a bug." | 28 Oct |
| 26 | Every chat has a ticket. At its start, before its first task, a chat searches the tickets for one that matches; if one exists, the chat reads it in full to make sure it fits, then claims it; else it creates one. Noam, 28 Oct: "from now on, i want a 'open a ticket for this chat?' prompt at the start of chats. it can be local, before anything is sent to any llm, to be fast."; then: "just always create a ticket or latch onto an existing one (search first). if latching, read it in full to make sure it makes sense." Built 28 Oct as a rule the session-start hook prints (the search and the reading are the chat's own work, so it cannot be local). | 28 Oct |
| 27 | A DONE button at the end of the chat (next to "Next"). It is grayed out and disabled while anything is typed in the input box. Pressed: if the chat has not run /finalize-chat, a popup asks "Do you want to finalize the chat first?" with Yes (the chat runs /finalize-chat, then the rest), No (the rest only) and Cancel (nothing happens). The rest: the chat is hidden from the queue as the trash icon does (until it replies again), and the page opens the next chat that waits for Noam, as "Next" does. Noam, 28 Oct: "we also want a DONE button in the end of the chat that will do 'next' and remove the chat from the queue (not waiting for anything forever). it will be grayed out and disabled if anything is typed in the next. it will find if finalize-chat was called, and if not, it will raise a popup 'do you want to finalize chat first?' if yes, it will do it. if not, it will just do the trash. and also a cancel button in that popup". Built 28 Oct. | 28 Oct |
| 28 | The list shows what waits for Noam, nothing else. "Waits for me": a chat whose last reply ended with "question" or "Done" and that Noam has not dismissed, or whose process stands on a permission prompt right now. A running chat does not wait; a reply ending with "waiting for" or "blocker" does not wait; a Done needs Noam's approval (the trash) before it leaves. The chat on screen is always shown. Below the waiting chats, two collapsed lines, opened by a click: "Live chats (n)", every chat with a process whatever its state, and "Tickets-Unclaimed (n)", the tickets no chat has claimed. A claimed ticket is its chat's line and ranks as a chat. An "Archive" switch in the toolbar shows everything as before (the three groups of rule 7.0.1). Noam, 28 Oct: "the philosophy is to filter for the user only chats that require attention. the rest is spam. chats that are done and think they need a response: makes sense they appear."; "if it's running, it doesn't need me. i want chats that WAIT FOR MY INPUT to show"; "done: should be approved before removed from visibility. a chat that says done and not approved is waiting for me."; "claimed tickets are chats and are higher prio than unclaimed tickets. only unclaimed tickets collapse to Tickets. name it Tickets-Unclaimed"; "i also want a collapsed view of 'currently live chats' that would show a list of all chats that have a process, regardless of their status." | 28 Oct |
| 29 | Two icons on every chat line, on hover. The trash: "Hide <chat name> until it replies again?" Yes / Cancel; Yes records the chat's current reply as dismissed, the chat leaves the list (Archive still shows it) and comes back when it replies again, or at once on a permission prompt. The slashed eye: the chat goes to the end of the queue, no question asked. Nothing happens in the chat itself; `/finalize-chat` stays the way to end a chat. Noam, 28 Oct: "it will make sense to have some manual button to do that that is lightweight just for the queue rather than finalize-chat that involves the chat itself. something like a trash-bin icon on the list view items with a 'are you sure you want to <...>' popup."; "let's make a slashed (/) eye icon for send to end of queue, and trash for disappear. eye doesnt need a popup trash does." | 28 Oct |
| 30 | A chat counts as finalized when the finalize-chat skill ran in it, by the typed command or by words (the "oct_27 grpo dupe check #45" chat finalized by words and stayed listed). "Next" and Alt+Enter go to the next chat that waits for Noam and skip tickets. | 28 Oct |
| 31 | Every agent a chat spawns shows a live summary under its own call, as Cursor's panel does: the agent's description, what it is on (its last tool call or the head of its last text), its tokens (its context at its last call), its tool count and its time, ticking every second while it runs and updating within a few seconds of each step; a finished agent keeps its final tokens, tools and time. It works for chats run in Cursor or a terminal too: the figures come from the agent's own transcript, and a change in that transcript reloads the parent chat in the page. Noam, 28 Oct: "i want this type of live updating summary for running subagents when they exist, just like cursor does it"; "the subagents running screen is under the last message widget. it should be just like in cursor in the image i sent earlier." | 28 Oct |
| 32 | Reading older messages while the chat goes on: the reading position stays. New rows land below, out of view; a change in the height of what is above (a tool group of a running chat growing and folding, a row re-rendering) never moves what is read. Noam, 28 Oct: "when scrolled up, and new lines get posted by an active chat, the scroll jumps. it should be static, and new lines should be added outside of view and not make the current reading position jump". This holds for every way the chat changes: a reload of the transcript, and the rows the page streams in while it runs the chat itself. Noam, 29 Oct: "and i still see the scrolling jump". | 28 Oct, 29 Oct |
| 33 | A plan that waits for approval is unmistakable: a card above the input box says "The plan waits for your approval" with "Revise" and "Build the plan", and the prompt sound plays, as for any permission prompt. The plan itself opens in its tab as before. Noam, 28 Oct: "i did not see a popup to approve the plan, but did see the plan. when a plan is done there should be a popup like in cursor or at least a 'waiting for approval' message. input from user required". | 28 Oct |
| 34 | A chat with background work (a backgrounded command, an agent, a workflow) stays interactive: a new message goes into the same Claude Code process, as in Cursor, so the work goes on and its reports land in the chat as they come. No popup asks to stop the work. A new process replaces the held one only when it cannot take the turn (it is winding down, or the turn comes from another working folder). Noam, 28 Oct: "it seems 'background work' makes the chat block instead of keeping it interactive and get background messages as it goes, like cursor does. this is an issue. can we have it behave like cursor? background workers should work and not block". The same while the turn is still running: a message sent then is not queued "until this finishes"; it goes into the running process at once, is shown in the chat, and the chat works with it; the tools that run are not interrupted. The page never waits on "Running in the Claude CLI" for a process it started itself. Noam, 29 Oct: "this is not the cursor behavior. in cursor, my sent message is added to the chat, and the chat works with it. toold run in the background and this doesn't interrupt them. and there is no "running in the cli" that we wait forever for". | 28 Oct, 29 Oct |
| 35 | The running banner of a chat says what the chat is doing right now: its last tool call ("Bash: python hor.py status", "Read: <file>", "Agent: <its task>"), with the elapsed time, as the live agent summary does for an agent. Noam, 29 Oct: "i also expect the parent chat to show what it is this run is doing that we're waiting for". | 29 Oct |
| 36 | At the end of the chat, typing into the input box never moves the view: the end stays the end. Noam, 29 Oct: "when scrolling all the way down and then typing anything, it jumps up. we already had this issue". | 29 Oct |
