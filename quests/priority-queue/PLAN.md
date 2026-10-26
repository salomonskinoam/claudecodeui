# The priority queue for quests: the change

## 1. Why

Noam runs many Claude Code chats at once and loses his time finding which one needs him. This change adds one ordered queue of his chats and tickets to the quests page (the web page on http://localhost:3001, repo `~/src/quests/claudecodeui`). He answers the top entry, presses one key, and the next one comes. The order stays stable until something real changes it. Closed tickets and cleared blockers are never shown. Nothing opens a ticket or starts work by itself.

## 2. What the change must do

A ticket is a GitHub issue in salomonskinoam/tickets, of kind `quest`, `sidequest` or `blocker` (label). A chat claims a ticket with a comment "Claimed by chat <name>, session <session id>, ...". A blocker's body has a section "## Blocks" with the session ids of the chats it blocks.

"New" means nothing of it is built. "Partly built" names the part that already works and is not touched.

| # | Requirement | Status |
|---|---|---|
| 1 | The queue holds every open ticket and every chat that has a ticket or a live process. A chat that claimed a ticket is that ticket's entry. A chat leaves when its ticket closes; with no ticket, when Noam runs /finalize-chat in it. Its state comes from its last closing line, so it keeps its place when its editor tab closes. | New |
| 2 | Roots: a quest (always, also with a parent), a ticket whose parent is closed or missing, a chat with no ticket. A family is a root plus the blockers and side quests under it. | New. The kinds, the parent links and the claims already exist on the tickets; reading them into a queue is new. |
| 3 | Inside a family a blocker ranks above every chat it blocks; a side quest ranks below its parent. Kinds order only inside a family. | New. The ticket system states this rule in words, with no code behind it. |
| 4 | Roots get an arbitrary place when they appear, and it sticks. A new root goes last. When a root closes, its children become roots and keep its place. | New |
| 5 | A chat waiting on a permission prompt ranks above everything. Equal rank: permission prompt, then question, then Done, oldest first. | New. The page already knows which chat waits on a permission prompt (the blue dot). |
| 6 | Noam changes only the place of a root, by dragging. The root moves alone; a family member that would end on the wrong side joins the dragged block, which grows and moves on as one. Live while the mouse button is held; released inside keeps the order, released outside undoes it. | New. Dragging tabs is built; dragging list lines is not. |
| 7 | The session list becomes one flat list in queue order, name only, live, replacing the grouping by project. One generated background color per family. Logos removed. | New. Lean one-line rows, the dots and the live refresh are built and stay. |
| 8 | A forest widget above the list: roots side by side, children below, a small collapse button per node, click opens like the line, hover shows the ticket name and highlights node and line both ways. | New |
| 9 | Ticket lines have a GitHub link and a "close" button. Chat lines have an "Open in Cursor" link (`cursor://anthropic.claude-code/open?session=<session id>`). | New. The Cursor link is built only in the approval popup for chats waiting in Cursor. |
| 10 | An entry ranked above the shown chat blinks when it becomes ready for Noam. | New |
| 11 | Sending does not take a chat out of the queue. A "Next" button and Alt+Enter open the highest entry that needs Noam; Alt+Enter first sends typed text. Plain Enter sends and stays. | Partly built: plain Enter already sends and stays. "Next" and Alt+Enter are new. |
| 12 | Leaving a chat without sending, by picking another one by hand, puts it on top below permission prompts (the "on top latch"): one chat at a time, releasable, moving as a drag does. | New |
| 13 | A chat open in another editor (Cursor, the Claude desktop app, a terminal) is read-only in the page, with its Cursor link. | New. The popup for a Cursor chat waiting on a permission prompt is built and stays; locking the input box is new. |
| 14 | Closing a root with open blockers first raises a popup: "are you sure", the open blockers listed, options yes / convert the blockers to quests / convert them to side quests / close the blockers too / other kind. In the chats and in the page. | New. Closing tickets from a chat is built (the ticket-work skill); the popup and closing from the page are new. |
| 15 | Clicking an unclaimed ticket opens a new chat in the page, in the folder of the chat that opened the ticket, with "we are starting this ticket <link>" typed in, not sent. | New. The page can already keep text in a new chat's input box; using that from a ticket is new. |
| 16 | Every chat is named "<mm_dd> <world> <2 word objective>", plus " #<ticket number>" when it comes from a ticket. A popup asks Noam, offering "let Haiku choose"; the format is always kept. In the page for chats from tickets; right after the worktree question for other chats. | New. Renaming by hand in Cursor is built, and the page already shows that name first. |
| 17 | Every reply ends with a third closing line, after "Running:" and "Required from you:": "waiting for <what>", "question <what>", "blocker <what>" (open blockers only) or "Done <what>". "question" and "Done" need Noam; "waiting for" and "blocker" do not. A hook sends a reply without the line back once; the second try passes. It goes live right after its check. It lives outside the noam_worlds repo and is not an output style. | New. The two lines "Running:" and "Required from you:" already exist in the noam_worlds output style and stay. |
| 18 | Every chat tells its parent, sibling and child chats when the kind of its closing line changes, on every ticket update, and when Noam says so: a message when live, else a comment on their ticket. | Partly built: on a ticket update, the ticket-work skill already tells the parent chat and the child chats. Siblings, a change of the closing line's kind, and "when Noam says so" are new. |
| 19 | The order is stored in the quests server's database and mirrored to GitHub within seconds as one file in salomonskinoam/tickets, restored from there after a disk loss. | New |

## 3. The change, step by step

### Step 1. Closing line, family rule, names (new files in `~/src/quests/claudecodeui/quests/`)

| File | What it does |
|---|---|
| `hooks/queue_start.sh` | SessionStart hook. Prints three rules into the chat. The closing-line rule: "Every reply ends with one more line after Running: and Required from you:, exactly one of: waiting for <what> / question <what> (with its background and history) / blocker <what> (open blockers only) / Done <what>. A reply without it is sent back to you once." The family rule: the chat's own ticket (`gh issue list -R salomonskinoam/tickets --state open --search "<session id> in:comments"`), its parent, siblings and children with their claiming chats' names and session ids, and "Tell them when the kind of your closing line changes, on every ticket update, and when Noam says so: SendMessage if live (ListAgents), else a comment on their ticket." On a fresh start only, the name rule: "Right after the worktree question, ask Noam with AskUserQuestion for this chat's name <mm_dd> <world> <2 word objective>, options: your proposal and Let Haiku choose; then run rename_chat.mjs." |
| `hooks/queue_stop.sh` | Stop hook. If `stop_hook_active` is true, exit 0. Else take the last assistant text of the transcript (`jq -rs '[.[] \| select(.type=="assistant")] \| last \| .message.content[]? \| select(.type=="text") \| .text'`), its last non-empty line; if it matches `^(waiting for\|question\|blocker\|done)\b[ :]*.+` (case ignored), exit 0; else exit 2 with the closing-line rule on stderr. |
| `tools/rename_chat.mjs` | `node rename_chat.mjs <session id> <name>`: checks the format, then `renameSession(sessionId, name)` of `@anthropic-ai/claude-agent-sdk`. With `--haiku <text> [--ticket <n>]`: asks Claude Haiku (`query` with model `claude-haiku-5-5`, no tools, no settings, no saved session, in `~/.cache/quests-haiku`) for "<world>\|<word> <word>", builds the name from the local date, then deletes the title stub the call leaves in `~/.claude/projects`. |
| `~/.claude/settings.json` | Two hook entries: SessionStart (`startup\|resume\|compact`) runs `queue_start.sh`; Stop runs `queue_stop.sh`. The Stop entry is added only after step 1's check passes. |

### Step 2. The close popup in the chats (`~/src/tickets/hooks/guard_root_close.sh`, new)

A PreToolUse hook on Bash for `gh issue close <n>` on salomonskinoam/tickets. It passes when the command starts with `TICKET_CLOSE_OK=1`. Otherwise it reads the ticket: root means kind quest or no open parent; open blockers are its open sub-issues labeled `blocker` plus open blockers whose "## Blocks" names a chat that claimed it. A root with open blockers: exit 2 with the list and "Ask Noam with AskUserQuestion: Yes, close it / Convert the blockers to quests / Convert the blockers to side quests / Close the blockers too (Other: a kind). Do his choice, then close again with TICKET_CLOSE_OK=1." One entry in `~/.claude/settings.json` (PreToolUse, matcher Bash).

### Step 3. The server (new module `server/modules/queue/`)

| Part | What |
|---|---|
| Tables in `~/.cloudcli/auth.db` (added in `server/modules/database/schema.ts` and `migrations.ts`) | `queue_state(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)` holding `order` (JSON list of keys `ticket:<n>` / `chat:<session id>`) and `latch` (one key or null). `queue_chats(session_id TEXT PRIMARY KEY, line_kind TEXT, line_text TEXT, line_at TEXT, finalized INTEGER)`. |
| `queue-sources.service.ts` | Tickets every 15 seconds: one `gh api graphql` call for the open issues with `number title url body createdAt labels parent{number state} comments(last:50){body createdAt}`, paged by 100. Claims by `Claimed by chat (.+?), session ([0-9a-f-]{36})`, blocks by the session ids inside `## Blocks(.*?)(\n## \|\Z)`. Every 2 seconds: the live processes in `~/.claude/sessions/*.json` (state busy over waiting over idle when one chat has two processes, which also fixes the page's dots) and Cursor's open tabs (`panelTabSessions` of key `Anthropic.claude-code` in `~/.config/Cursor/User/workspaceStorage/*/state.vscdb`, read-only). On each transcript change (hooked into the existing watcher's flush in `server/modules/providers/services/sessions-watcher.service.ts`) and at start for chats changed in the last 14 days: the closing line from the last 256 KB of the transcript, and `finalized` when a user line holds `<command-name>/finalize-chat</command-name>`. |
| `queue-order.ts` | The order, pure functions shared with the page (below). |
| `queue.service.ts` | Builds the entries, their state (first match: permission prompt, running, question, Done, waiting for, blocker, unclaimed ticket, none yet; needs Noam for permission prompt, question, Done, unclaimed ticket), "held outside" (a live process with entrypoint `claude-vscode`, `claude-desktop` or `cli`, or an open Cursor tab), stores the repaired order, mirrors it, runs close and rename. |
| `queue.routes.ts` at `/api/quests/queue` | `GET` (entries, order, latch, view). `PUT order`, `PUT latch`. `POST close {number, choice}` (runs `gh issue edit` / `gh issue close` and a comment "Closed from the quests page by Noam, <time>"). `POST rename {sessionId, name}` and `POST suggest-name {number}` (both through `rename_chat.mjs`). |
| Mirror | 10 seconds after a change, `{order, latch, updatedAt}` is written as `queue/order.json` on branch `queue-state` of salomonskinoam/tickets through `gh api -X PUT .../contents/queue/order.json`. An empty table at start is restored from it. |

### Step 4. The order (`server/modules/queue/queue-order.ts`, test `quests/priority-queue/order.test.mjs`)

Constraints "a above b": every open blocker above each entry of a chat it blocks; every open parent above its side quest.

```
repair(stored, entries):
  list = stored keys that are still entries
  new entries, in tie order: a root goes last; a blocker right above the highest entry it blocks;
     a side quest right below the lowest member of its parent's family
  side quests of one parent keep their positions and sort inside them by tie order, then age
  stable topological sort: repeatedly place, among entries whose "above" partners are placed,
     the one highest in list
drag(list, key, target):
  move key to target; lift every must-be-above entry now below it to just above it;
  drop every must-be-below entry now above it to just below it; repair
view: permission prompts first (stored order), then drag(rest, latch, 0) if a latch is set
next: first entry of the view that needs Noam and is not the shown chat
```

### Step 5. The list (page)

| File | Change |
|---|---|
| `src/modules/queue/useQueue.ts` (new) | Polls `GET /api/quests/queue` every 2 seconds; holds the shared hover key. |
| `src/modules/queue/QueueList.tsx` (new) | The flat list: dot, name, family color `hsl(hash(root key) % 360, 35%, 22%)`, GitHub link and close button on tickets, Cursor link on chats, release button on the latched line, blink, drag of root lines (native drag events; preview `drag(...)` while held; drop sends `PUT order`; release outside restores). |
| `src/modules/queue/CloseTicketDialog.tsx` (new) | The page's close popup; calls `POST close`. |
| `src/modules/sidebar/SidebarContent.tsx` | `QueueList` replaces `SidebarProjectList`. |
| `SidebarHeader.tsx`, `SidebarSessionItem.tsx`, `SidebarRecentConversations.tsx`, `SidebarContent.tsx` | Remove the app logo block and the provider logos. |

### Step 6. Next, latch, read-only (page)

| File | Change |
|---|---|
| `src/modules/chat/hooks/useChatComposerState.ts` | Alt+Enter: send if there is text, then open next. Mark the chat "sent since shown" on every send. |
| `src/modules/chat/composer/ChatComposer.tsx` | A "Next" button. |
| `src/modules/project-workspace/ProjectWorkspaceShell.tsx` | "open next"; on a manual switch (line, tab, node) away from a chat not "sent since shown", `PUT latch`. |
| `src/modules/chat/composer/OutsideChatBanner.tsx` (new), `ChatInterface.tsx` | For a chat held outside, the banner "Open in Cursor to answer" replaces the input box. |

### Step 7. New chat from a ticket (page)

| File | Change |
| `src/modules/queue/NameChatDialog.tsx` (new) | Name popup: date fixed, world from the ticket's label, two words, "Let Haiku choose" (`POST suggest-name`), "Start". |
| `src/modules/queue/startTicketChat.ts` (new) | The folder: the session id in the ticket's "## Parent chat" section, that chat's `project_path`, a worktree path cut back to its repo. Then `writeDraftText('project:<id>', 'we are starting this ticket <link>')` and the page's new-session action in that project. When the chat gets its session id (`replaceNewChatTab`), `POST rename`. |

### Step 8. The forest widget (page)

`src/modules/queue/QueueForest.tsx` (new), above `QueueList` in `SidebarContent.tsx`, at most a third of the sidebar's height, own scroll: roots side by side, families below, a collapse button per node, hover shared with the list, click opens.

### Records

Each step adds its rows to a new section "Priority queue" in `local_features_noam.md`, its new files to `quests/README.md`, is committed and pushed, and gets one comment on ticket 32.

## 4. Checks

| Step | Check |
|---|---|
| 1 | `queue_stop.sh` on made-up inputs: no line, exit 2; "Done step one", exit 0; `stop_hook_active` true, exit 0. `queue_start.sh` for this chat prints the three rules and ticket 32's family. `rename_chat.mjs` renames a throwaway chat and the page shows it. Then the Stop entry goes in; one live chat is sent back once and then ends with the line. |
| 2 | `guard_root_close.sh` on a close of ticket 7 (open blockers 3, 5, 6): exit 2 listing them; with `TICKET_CLOSE_OK=1`: exit 0; a ticket without open blockers: exit 0. Nothing is closed. |
| 3 | `GET /api/quests/queue` lists ticket 32 with this chat, the same open tickets as `python3 ~/src/tickets/forest.py`, and every live chat; a new closing line shows within 3 seconds; `queue/order.json` appears on branch `queue-state` within 10 seconds of a `PUT order`; an emptied table is restored on restart. Also read the `entrypoint` of a page-run chat, so it is not counted as held outside. |
| 4 | `node quests/priority-queue/order.test.mjs`: consistent orders stay; a violation is fixed by one move; blockers stay above, side quests below; a drag carries the family member it would pass, both ways; new roots go last; new blockers go right above; permission prompts and the latch on top in the view; next skips the shown chat and entries that do not need Noam. |
| 5 | New headless checks in `quests/tests/headless.cjs`: `queue` (lines equal the API's view, one color per family, no logos) and `drag` (the block grows; release outside undoes). |
| 6 | `next` (Alt+Enter sends and opens the next), `latch` (a manual switch without sending puts the chat on top; release puts it back), `readonly` (a Cursor chat shows the banner). Time how fast Cursor's tab list changes after a tab opens. |
| 7 | An unclaimed test ticket opens a new chat in the noam_worlds folder with "we are starting this ticket <link>" unsent; after the first message its name is "<today> <world> <two words> #<n>" in the page; check whether Cursor shows it too. |
| 8 | `forest`: roots side by side, collapse hides children, hover highlights both ways, click opens. |
