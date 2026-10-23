# Priority queue for quests: plan

Ticket: https://github.com/salomonskinoam/tickets/issues/32 (oct_09 priotity queue: tickets priority queue). Requirements, verbatim and as read: `quests/priority-queue/REQUIREMENTS.md` in salomonskinoam/claudecodeui, commit 97f1c33. This plan stands alone; everything it needs is written here.

## 1. Philosophy

Noam runs many Claude Code chats at once. A chat lasts one to two days. Most of his time goes into scrolling, switching between chats and remembering where each one stood. He wants to always talk to the one chat that needs him most, answer it, and get the next one.

The ticket system (salomonskinoam/tickets, built 2026-10-13 to 2026-10-16) already cuts growing work out of chats into tickets of three kinds: quest, side quest, blocker. A blocker ranks above what it blocks, a side quest below its parent. Noam decides when a ticket is opened, and Noam opens chats from tickets. Nothing opens a ticket or starts a chat by itself.

The queue is the missing piece: one list that puts every open chat and ticket in the order Noam should handle them, keeps that order stable, and brings him the next one with one key.

Two principles hold everywhere:

| Principle | Meaning |
|---|---|
| Closed things are never shown again | A closed ticket, a cleared blocker, a settled decision is never named again. Noam, 2026-10-20 20:50: "we shouldn't spam closed tickets, that's the whole point of all of this." (tickets repo `philosophy.md`, commit 439802f) |
| The order is stable | An order, once given, sticks until something real changes it. Noam, 2026-10-20 18:49: "that ranking sticks until the following change." |

## 2. What exists

| Piece | Where | What it does today |
|---|---|---|
| The quests page | `~/src/quests/claudecodeui` (fork of CloudCLI UI, public repo salomonskinoam/claudecodeui), service `quests-ui.service` on 127.0.0.1:3001 | Shows every Claude Code chat on the machine, tabs per pane, split screen, session list on the right, one status dot per chat. Features list: `local_features_noam.md`. |
| Session list | `src/modules/sidebar/` (`SidebarProjectList.tsx`, `SidebarProjectSessions.tsx`, `SidebarSessionItem.tsx`; a flat list already exists in `SidebarRecentConversations.tsx`) | Grouped by project, newest first. Click opens a chat as a left-pane tab (`openLeftTab`, `src/shared/hooks/useSplitPane.ts:71`), Ctrl+click in the right pane (`openRightTab`). |
| Status dots | `src/shared/hooks/useLiveChats.ts`, server `GET /api/quests/live` (`server/index.ts:231`) | Polls every 2 seconds. Reads Claude Code's registry `~/.claude/sessions/*.json` (one file per live process: `status` busy, waiting or idle; `waitingFor` "permission prompt" or "input needed"; `entrypoint`). Drops idle processes today. |
| Drafts | `src/shared/chatDrafts.ts` (`writeDraftText`), key `project:<projectId>` for a new chat | Text typed into an input box survives a reload. Writing a draft before opening a new chat fills its input box. |
| Input box keys | `src/modules/chat/hooks/useChatComposerState.ts:1163` (`handleKeyDown`, `handleSubmit` at :980) | Enter and Ctrl+Enter send, Shift+Enter makes a new line. Alt is unused. |
| Approval popup for outside chats | `src/modules/chat/composer/OutsideApprovalBanner.tsx:63` | The one place that uses `cursor://anthropic.claude-code/open?session=<id>`. Nothing locks the input box for chats open in another editor. |
| Tab drag | `src/modules/project-workspace/PaneTabs.tsx` | Native browser drag events, a blue landing line. |
| Server modules | `server/modules/<x>/` (routes, services, repository in `server/modules/database/repositories/`) | Pattern to copy: `server/modules/scheduled-messages/` (an interval with an in-flight guard, started from the `listen` callback in `server/index.ts:428`). |
| Database | better-sqlite3, `~/.cloudcli/auth.db`, tables in `server/modules/database/schema.ts`, added by `runMigrations` (`migrations.ts:493`) | Holds sessions (`session_id`, `provider_session_id`, `project_path`, `jsonl_path`, `custom_name`). Not backed up. |
| Live push | Websocket `/ws`, clients in `connectedClients`, send loop `sendToConnectedClients` (`session-upsert-broadcast.service.ts:66`, not exported) | Sends `session_upserted` frames. A file watcher on `~/.claude/projects` (`sessions-watcher.service.ts:197`) fires within 0.5 to 2 seconds of a transcript change. |
| Page chats | `claude-runtime.provider.js` (`queryClaudeSDK`), `settingSources = ['project','user','local']` | Chats run from the page load the user's hooks, so session start hooks run for them too. |
| Headless checks | `quests/tests/headless.cjs` | Signs a token from `~/.cloudcli/auth.db`, opens the page in Chrome, runs one named check (`live`, `pin`, `bottom`, `scroll`, `tabs`, `mode`, `plan`). |
| Tickets | GitHub issues in private repo salomonskinoam/tickets, clone `~/src/tickets` (rules `REQUIREMENTS.md`, commit 8442f98) | Kind by label (`quest`, `sidequest`, `blocker`). Parent by GitHub sub-issue. A blocker's "## Blocks" section names chats by session id. A claim is a comment "Claimed by chat <name>, session <id>, ...". |
| Ticket tree | `~/src/tickets/forest.py` | Draws the tree. Logic is all inside `main()`; one GitHub call per issue for the parent, about 30 seconds a run. Its regexes (`CLAIM`, `SID`) and the Blocks and own-ticket rules are what the server ports. |
| Ticket hooks | `~/src/tickets/hooks/`, wired in `~/.claude/settings.json` | `session_start.sh` prints the session id, "Your ticket: #N", children, open blockers naming the chat. `validate_ticket.sh` shows the popup pattern (`permissionDecision: "ask"`) and the block pattern (reason on stderr, exit 2). |
| Close steps | `~/src/tickets/skills/ticket-work/SKILL.md` close step, line 44 (`gh issue close`); `finalize-chat` delegates to it | The only place a chat closes a ticket. |
| Stop hook pattern | `~/src/noam_worlds/sdk/plugins/hor/hooks/stop_check.sh` | Reads the last assistant text with one `jq` line from `transcript_path`; blocks with exit 2 and text on stderr; lets the second try pass (`stop_hook_active`). |
| Cursor's open tabs | `~/.config/Cursor/User/workspaceStorage/<id>/state.vscdb`, table ItemTable, key `Anthropic.claude-code`, field `panelTabSessions` | One entry per open Claude tab (sessionId, title). On 2026-10-21 it matched the live claude-vscode processes exactly (7 and 7). |

## 3. What is required

The full list, as ruled by Noam between 2026-10-09 and 2026-10-21. Numbers are the rule numbers of the requirements file.

| # | Requirement |
|---|---|
| 1 | The queue holds chats that wait for Noam and open tickets no chat has claimed. |
| 2 | The interface is the quests page. |
| 3 | The order is one list over all entries, shaped by a forest. A root is a ticket of kind quest, a ticket with no open parent, or a chat with no ticket. A quest is always a root, also with a parent (it stays linked, outside the parent's family). Roots get an arbitrary place when they appear, and that place sticks. |
| 4 | A family is a root and the blockers and side quests under it. Inside a family: a blocker above the chats it blocks; a side quest below its parent. Never changed by hand; changing a ticket's kind moves it. |
| 5 | Kinds order only inside a family. Between families only the roots' places count. |
| 6 | When a root closes before its children, the children become roots and keep its place. |
| 6.1 | Closing a root that still has open blockers raises a popup first: "are you sure", the open blockers listed, options: yes; convert the blockers to quests; convert them to side quests; close the blockers too; other (a kind Noam types). In the chats and in the page. |
| 7 | A permission prompt ranks above everything. |
| 8 | Equal priority: permission prompt, then question, then Done; oldest first. |
| 9 | Noam changes only the place of a root by hand. |
| 10 | Dragging a root moves it alone; other families may end up between its members. A family member that would end on the wrong side joins the dragged block; the block grows and moves on as one. |
| 11 | The drag is live while the mouse button is held. Released inside: the new order stands. Released outside: undo. |
| 12 | A new entry is placed by rules 4 to 8; a new root goes last (also a new quest with a parent). |
| 12.1 | The list holds every open ticket and every chat with a ticket or a live process. "Next" skips entries that do not need Noam. A chat leaves when its ticket closes, or, with no ticket, when it is finalized. A chat's state comes from its last closing line, so a closed editor tab keeps its place. |
| 13 | The order lives in the quests server's local database, mirrored to GitHub within seconds as one file in salomonskinoam/tickets, restored from there after a disk loss. |
| 14 | The session list is one flat list in queue order, name only, top first, live. It replaces the projects grouping. |
| 15 | Each family has its own generated color, used as the background of its lines. |
| 16 | A separate widget shows the forest, horizontal, roots on the top level, a small collapse button per node. Clicking a node opens it like its line. Hovering a node shows the ticket name and highlights its line, and the other way around. |
| 16.1 | Every ticket entry has a clickable link to the ticket. |
| 17 | Every chat line has an "Open in Cursor" link. |
| 18 | Sending a message does not take a chat out of the queue; the page stays on the chat. |
| 18.1 | Clicking an unclaimed ticket opens a new chat in the page with "we are starting this ticket <link>" typed in, not sent, in the folder of the chat that opened the ticket. |
| 18.1.1 | A chat created from a ticket is named "<mm_dd> <world> <2 word objective> #<ticket number>", for example "10_22 quests priority queue #32". Noam, 2026-10-22 19:43: "when creating a chat, i want it named "<mm_dd> <world> <2 word objective> #<ticket num>"". |
| 18.2 | A chat open in another editor (Cursor, the Claude desktop app, a terminal) is read-only in the page, with its "Open in Cursor" link. |
| 18.3 | Leaving a chat without Enter, by picking another chat by hand, puts it on top (below permission prompts): the "on top latch", one chat at a time, releasable. |
| 18.4 | The latched chat moves as in rule 10. |
| 18.5 | When a chat ranked higher than the current one becomes ready for Noam, its line blinks. |
| 19 | A button and Alt+Enter "bring me the next one in line". Alt+Enter first sends typed text. Plain Enter sends and stays. |
| 20 | Every reply ends with a third closing line owned by the queue: "waiting for <what>", "question <what>", "blocker <what>" or "Done <what>". |
| 20.0 | "question" and "Done" give a queue place; "waiting for" none until the awaited thing returns; "blocker" none. |
| 20.1 | "blocker" names only open blockers. |
| 21 | A hook lets no reply pass without the line and sends it back with instructions. |
| 22 | That hook and its instructions belong to the queue's harness, apart from the noam_worlds harness, and not as an output style. |
| 23 | Nothing opens a ticket by itself. |
| 24 | Every chat tells its parent, sibling and child chats about its events (every changed closing line, every ticket update): a message when live, else a comment on their ticket. Home: the queue's instruction text. |

## 4. The model

### Entries

| Entry | Key | Comes from |
|---|---|---|
| An open ticket | `ticket:<number>` | GitHub. If a chat claimed it, the entry shows that chat (the newest claim) and opens it. |
| A chat with no ticket | `chat:<session id>` | The registry (live process) or its stored closing line (not "Done"). |

A chat with a ticket is not a second entry; it is its ticket's entry.

### State of an entry

| State | Read from | Needs Noam |
|---|---|---|
| permission prompt | registry `status` waiting, `waitingFor` "permission prompt" | yes |
| question | closing line "question", or registry `waitingFor` "input needed" | yes |
| Done | closing line "Done" | yes |
| unclaimed ticket | GitHub, no claim | yes |
| running | registry `status` busy | no |
| waiting for | closing line "waiting for" | no |
| blocker | closing line "blocker" | no |
| none yet | no closing line (chats from before the hook) | no |

A chat with no ticket counts as finalized, and leaves, when its last closing line is "Done" and it has no live process.

### The constraints

A pair "a above b" for: every blocker and each entry it blocks (the claimed tickets of the chats in its "Blocks" section); every side quest's parent and the side quest. Quests have no constraint with their parent (rule 3).

### The stored order

One list of keys, top first, plus at most one latched key. Everything else is computed.

| Operation | Rule |
|---|---|
| Repair (after each refresh) | A stable topological sort: among the entries whose "above" partners are already placed, take the one that stands highest in the stored list. Consistent stretches keep their order; each violation is fixed by the smallest move. |
| New entries | A new root goes last. A new blocker goes right above the highest entry it blocks. A new side quest goes right below the lowest member of its parent's family. Several new at once go in rule 8 order. |
| Siblings | Entries of one family with no constraint between them keep the slots they hold; inside those slots they sort by rule 8 (permission prompt, question, Done, then the rest; oldest first). |
| Drag of a root to a place | The root takes the place. Every entry that must be above it and now stands below is lifted to just above it, keeping its order; every entry that must be below it and now stands above is dropped to just below it. Then repair. This is the growing block of rule 10. |
| View | Permission prompts first, in stored order. Then the latched chat, placed by the drag rule at the top. Then the rest. The latch is a view only; releasing it shows the stored order again. |

The algorithm is one pure TypeScript module, used by the page for the live drag and by the server for the stored order, with one test file of plain asserts.

## 5. Implementation

### 5.1 The queue harness (step 1)

Lives in the quests repo, `quests/hooks/`, wired through `~/.claude/settings.json` like the ticket hooks. Nothing in noam_worlds.

| File | Event | What it does |
|---|---|---|
| `quests/hooks/queue_start.sh` | SessionStart (startup, resume, compact) | Prints the closing-line rule (four endings, the third line after the output style's two, "blocker" names only open blockers) and the family rule: the chat's parent, siblings and children with their session ids, read from GitHub with the claim and sub-issue data. |
| `quests/hooks/queue_stop.sh` | Stop | Last assistant text by the `jq` line of `stop_check.sh`; its last non-empty line must match `^(waiting for|question|blocker|Done) .+`. Missing: exit 2 with what is missing and the instruction text. |

### 5.2 The close popup in the chats (step 2)

`~/src/tickets/hooks/guard_root_close.sh`, PreToolUse on Bash, matching `gh issue close` on salomonskinoam/tickets. If the ticket is a root with open blockers, it blocks (exit 2) with the list of open blockers and the instruction: ask Noam with the five options of rule 6.1, carry out his choice, then close again with `TICKET_CLOSE_OK=1`. The only change in the tickets repo.

### 5.3 The server (step 3)

New module `server/modules/queue/`.

| Part | What |
|---|---|
| Table `queue_state` | Key and value: `order` (list of keys as JSON), `latch` (one key or empty). Plus `queue_chats`: session id, closing-line kind and text, time. |
| Tickets | Every 15 seconds one GraphQL call through `gh api graphql`: open issues with number, title, labels, body, last comments, parent number. Claims and "Blocks" parsed with the regexes of `forest.py`. |
| Chats | Every 2 seconds: the registry (live processes, idle ones included, with `entrypoint`) and Cursor's `panelTabSessions`. On every transcript change (the existing watcher): the chat's last closing line, stored in `queue_chats`. At start: the closing lines of chats changed in the last 14 days. |
| Routes | `GET /api/quests/queue` (entries with state, kind, family, constraints, the stored order, the latch). `PUT /api/quests/queue/order`, `PUT /api/quests/queue/latch`. |
| Push | A `queue_updated` frame on the websocket whenever an input changes (`sendToConnectedClients` exported). |
| Mirror | 10 seconds after a change to order or latch, one file `queue/order.json` written through the GitHub contents API to branch `queue-state` of salomonskinoam/tickets (off main, so the local clone is not disturbed). At start, an empty table is restored from it. |

### 5.4 The page

| Step | Part | What |
|---|---|---|
| 4 | Order module | `src/modules/queue/queueOrder.ts` (section 4) and `quests/priority-queue/order.test.mjs`. |
| 5 | The list | `src/modules/queue/useQueue.ts` (fetch plus websocket) and `QueueList.tsx`, which replaces the project list in `SidebarContent.tsx`. One line per entry: dot, name, family color as background (color from the root key, fixed lightness for the dark theme), "Open in Cursor" link on chats, ticket link on tickets. Roots draggable with native drag events as in `PaneTabs.tsx`; the order recomputed live while the button is held; release inside sends `PUT order`, release outside restores. The latched line has a release button. A line ranked above the shown chat blinks when it becomes ready for Noam (rule 18.5). The forest widget sits above the list; sidebar logos are removed. |
| 6 | Using it | In `handleKeyDown`: Alt+Enter submits typed text, then opens the next entry that needs Noam (not the current chat). A "Next" button beside the input box does the same without sending. Latch: when Noam picks another chat by hand (list, tab, forest node) and the chat he leaves got no message since it was shown, `PUT latch`. Read-only: a chat with a live process outside the page, or in Cursor's tab list, gets a banner with "Open in Cursor" instead of the input box. |
| 7 | New chat from a ticket | Find the parent chat's folder (session id from the ticket's "Parent chat" section, its `project_path`; a worktree path maps to its repo's main folder), `writeDraftText('project:<id>', 'we are starting this ticket <link>')`, open a new chat in that project. When the chat gets its session id (first message sent), the server names it with the Agent SDK's `renameSession(sessionId, name)`, the same rename that Cursor and the page already show first (row 33 of `local_features_noam.md`): `<mm_dd>` the local date, `<world>` the ticket's world label, `<2 word objective>` as decided in open decision 7, `#<ticket number>`. |
| 8 | The forest widget | `src/modules/queue/QueueForest.tsx`, plain nested boxes, no library: roots across the top, children growing below each, a small button per node to collapse or open. Shared hover state with the list. |

### 5.5 Records

Every step adds or updates its rows in `local_features_noam.md` (new section "Priority queue") and `quests/README.md` in the same commit, is pushed to salomonskinoam/claudecodeui (the tickets hook to salomonskinoam/tickets), and posts an update comment on ticket 32.

## 6. Verification

| Step | Check |
|---|---|
| 1 | `queue_stop.sh` fed a fake hook input: a transcript ending without the line exits 2 with the instructions; with "Done <what>" exits 0. One real chat ends a turn, gets sent back once, then ends with the line. |
| 2 | `guard_root_close.sh` fed `gh issue close` on a root with an open blocker: blocked with the list; with `TICKET_CLOSE_OK=1`: passes; on a ticket with no open blocker: passes. |
| 3 | `GET /api/quests/queue` lists ticket 32 and this chat; a changed closing line shows within 3 seconds; `queue/order.json` appears on branch `queue-state` within 10 seconds of a `PUT order`. |
| 4 | `node quests/priority-queue/order.test.mjs`: repair keeps consistent orders, fixes violations; a blocker stays above, a side quest below; a drag past a side quest carries it; a drag above a blocker carries it; new roots go last; permission prompts and the latch on top in the view. |
| 7 | A new chat from ticket 32 opens with "we are starting this ticket https://github.com/salomonskinoam/tickets/issues/32" in its box, unsent; after its first message its name in the page and in Cursor is "<today> quests <2 words> #32". |
| 5 to 8 | New checks in `quests/tests/headless.cjs`: `queue` (list order and colors), `drag` (block grows, release outside undoes), `next` (Alt+Enter opens the next entry), `latch`, `readonly`, `forest` (hover highlights both ways, collapse). |

Every build follows the memory rule: `free -m` first with several GB free, one heavy step at a time, `NODE_OPTIONS=--max-old-space-size=1536` under `nice`, `npm run build:client` when only the page changed; after a server change `systemctl --user restart quests-ui.service`.

## 7. Open decisions

1. Ruled 2026-10-23 14:30: the forest widget sits above the list of chats in the right sidebar; logos there are removed to save room.
2. Ruled 2026-10-23 14:30 ("ok"): the stop hook sends a reply back once; the second try passes (the guard of `stop_check.sh`).
3. The page cannot close tickets today, so rule 6.1 in the page needs a close action first. Proposal: a "close" button on ticket lines, which raises the same popup.
4. A chat with no ticket counts as finalized when its last closing line is "Done" and it has no live process. Proposal: that rule.
5. Rule 24 sends a family message on every changed closing line. Proposal: only when the kind of the line changes (for example from "waiting for" to "question"), not on every new text.
6. Turning on the stop hook makes every running chat on the machine, in every repo, add the line from its next reply on. Proposal: turn it on at the end of step 1, after the check.
7. Who writes the two-word objective of the chat name (rule 18.1.1). Options: Claude Haiku picks two words from the ticket title (runs through the page's Agent SDK on the subscription, about 4 seconds, measured 2026-10-09); the page shows a small name field filled from the ticket title for Noam to accept or edit; or the new chat proposes the two words on its first turn and the server renames it. Proposal: Haiku, no step for Noam. Also: a ticket with no world label (for example a quests ticket labeled only `quests`) takes that non-kind label as its world.
8. Rule 18.1.1 covers chats created from a ticket. Chats created with "New Session" have no ticket number. Proposal: they keep today's naming (rename by hand, else Claude Code's generated title).
