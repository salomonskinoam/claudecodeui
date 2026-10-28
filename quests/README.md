# quests

Everything of the quests setup lives in this repo (fork of siteboon/claudecodeui). Feature list, by behavior:
`../local_features_noam.md`.

## The model

Three things exist, each with one home, and the views read them.

| Thing | What it is | Home | Who reads it |
|---|---|---|---|
| Chats | One record per chat this machine knows: its name, its running process (if any), where it is open right now (Cursor, the Claude desktop app, a terminal, this page), its last closing line, whether /finalize-chat ran. A chat is open when a process runs it or a tab holds it somewhere. | `server/modules/queue/chats.ts`, joined on every read from the readers in `sources/` | The queue (its entries, the open group, read-only in the page) and the status dots (`/api/quests/live`) |
| Tickets | The open GitHub issues of salomonskinoam/tickets, with their kind, parent, blocks and claims | `server/modules/queue/sources/tickets.ts` | The queue |
| The queue | The entries (a ticket with its claiming chat, or a chat without a ticket), the stored order with the "on top" mark, and the rules (`queue-order.ts`) that give the view | `server/modules/queue/queue.service.ts` | The list and the forest in the sidebar; the tab rows, for a tab's color, sign and hover |
| The family colors | Which color each family wears: the palette, the rule (a pure function, `assignColors`) and the memory in the browser that keeps a color for good | `src/modules/queue/familyColors.ts`, test `src/modules/queue/tests/familyColors.test.ts` | The list, the forest and the tab rows, by a root key lookup only |

The page's tabs are the page's own place: the page owns them (`src/shared/hooks/useSplitPane.ts`) and reports them to the chats
model. "Sync from Cursor" copies Cursor's place into the page's.

| Path | What | Installed as |
|---|---|---|
| `system/quests-ui.service` | The page's server as a user service, on 127.0.0.1:3001, started at login | Link: `~/.config/systemd/user/quests-ui.service`, enabled (`default.target.wants`) |
| `system/quests-ide.desktop` | "Quests IDE": the page in its own Firefox window (profile `quests-ide`, window class `QuestsIDE`), rainbow icon | Link: `~/.local/share/applications/quests-ide.desktop` |
| `../scripts/start-local.sh` | Starts the server (used by the service) | |
| `../scripts/quests-update.sh` | The in-app Update: merges the original project's newest release into ours, rebuilds, pushes, restarts; rolls back on failure | Run by the page's Update button |
| `tests/headless.cjs` | Headless checks of the running page: live feed, pin, bottom, fast scroll, tabs, mode, plan, and the priority queue (queue, drag, next, latch, readonly, forest, ticketchat) | `node quests/tests/headless.cjs <check> <sessionId>` |
| `tools/set_window_class.py` | Gives an open X11 window the `QuestsIDE` class | |
| `tools/mockup.py` | The first throwaway mockup of the chat graph page | |
| `hooks/queue_start.sh` | Priority queue: at every chat start, the closing-line rule, the chat's family, and (fresh start) the name rule | `~/.claude/settings.json`, SessionStart |
| `hooks/queue_stop.sh` | Priority queue: sends a reply without its closing line back to the chat once | `~/.claude/settings.json`, Stop |
| `tools/rename_chat.mjs` | Names a chat in the one format, or lets Claude Haiku choose (`--haiku <text>`) | `node quests/tools/rename_chat.mjs <session id> "<name>"` |
| `tests/api.cjs` | Calls the running page's API as the user, for checks | `node quests/tests/api.cjs GET /api/quests/queue` |
| `priority-queue/` | The priority queue's requirements (Noam's words verbatim) and plan | |
| `examples/` | Use-case examples for the chat management design (side quest) | |

Setting up a new machine: clone, `npm install && npm run build`, `git remote add upstream https://github.com/siteboon/claudecodeui.git && git fetch upstream --tags`, then create the two links above, `systemctl --user daemon-reload`, `systemctl --user enable --now quests-ui.service`.
