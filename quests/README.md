# quests

Everything of the quests setup lives in this repo (fork of siteboon/claudecodeui). Feature list, by behavior:
`../local_features_noam.md`.

## The model

Three things exist, each with one home, and the views read them.

| Thing | What it is | Home | Who reads it |
|---|---|---|---|
| Chats | One record per chat this machine knows: its name, its running process (if any), where it is open right now (Cursor, the Claude desktop app, a terminal, this page), its last closing line, whether /finalize-chat ran. A chat is open when a process runs it or a tab holds it somewhere. | `server/modules/queue/chats.ts`, joined on every read from the readers in `sources/` | The queue (its entries, the open group, read-only in the page) and the status dots (`/api/quests/live`) |
| Tickets | The open GitHub issues of the user's tickets repo (`TICKETS_REPO`, `INTERFACE.md`), with their kind, parent, blocks and claims | `server/modules/queue/sources/tickets.ts` | The queue |
| The queue | The entries (a ticket with its claiming chat, or a chat without a ticket), the stored order with the "on top" mark, and the rules (`queue-order.ts`) that give the view | `server/modules/queue/queue.service.ts` | The list and the forest in the sidebar; the tab rows, for a tab's color, sign and hover |
| The dismissals | Which reply of which chat Noam dismissed (the trash icon): the chat is hidden while that reply is its last one | `server/modules/queue/dismissals.ts`, in the local database | The entries (`waitsForMe`) |
| The family colors | Which color each family wears: the palette, the rule (a pure function, `assignColors`) and the memory in the browser that keeps a color for good | `src/modules/queue/familyColors.ts`, test `src/modules/queue/tests/familyColors.test.ts` | The list, the forest and the tab rows, by a root key lookup only |

The page's tabs are the page's own place: the page owns them (`src/shared/hooks/useSplitPane.ts`) and reports them to the chats
model. "Sync from Cursor" copies Cursor's place into the page's.

On the server, `chats.ts` is the only module that reads the sources (`sources/`); the service (`queue.service.ts`) asks the chats
and the entries, never a source. On the page (`src/modules/queue/`), each piece of state has one home and the widgets only paint:

| Page module | One responsibility |
|---|---|
| `queueStore.ts` | The page's copy of the queue and every call that changes it |
| `shownChat.ts` | The chat on screen in the left pane, and the latch a chat takes when left quietly |
| `queueHover.ts` | The entry under the mouse, one key for all widgets |
| `familyColors.ts` | Which color a family wears |
| `entryLook.ts` | The look of an entry (color, shown, hover) joined once for the list, the forest and the tabs |
| `queueNavigation.ts` | Moving between chats: next, Sync from Cursor, how an entry is opened |
| `queueView.ts` | What the list shows: focus (the chats that wait for Noam, the two collapsed groups) or archive (everything); the mode kept in the browser |
| `DoneButton.tsx`, `DismissDialog.tsx`, `QueueGroupLine.tsx` | The DONE button of the composer, the trash's popup, a collapsed group line |
| `EntryDot.tsx`, `EntryTitle.tsx`, `KindSign.tsx` | The pieces of a line: the dot, "#n title" or the chat's name, the kind's sign |
| `QueueList.tsx`, `QueueLine.tsx`, `QueueForest.tsx`, `QueueToolbar.tsx`, `CloseTicketDialog.tsx`, `OutsideChatBanner.tsx` | The widgets |
| `useLineDrag.ts`, `useBlink.ts`, `useOpenEntry.ts` | Dragging a line, the blink, opening an entry |

| Path | What | Installed as |
|---|---|---|
| `system/quests-ui@.service` | One quests server as a user service, `quests-ui@<instance>`, its port and repos in `~/.config/quests/<instance>.env` (`INTERFACE.md`), capped at 2 GB, started at login | Link: `~/.config/systemd/user/quests-ui@.service`; `default.target.wants/quests-ui@<instance>.service` links to it |
| `../scripts/start-chat.sh` | One chat's service, `<prefix>-chat-<page session id>`, started by the page server's manager (`server/modules/chat-hosts`) with systemd-run from the newest build in `~/.local/share/<prefix>/builds/current`. Restarting quests-ui@<instance>.service never stops a chat. Record table `chat_hosts` | Started on demand |
| `bin/quests-listen` | Starts a listener for a chat as its own unit `<prefix>-listen-<id>`; the manager sends the chat its result and starts it again after a reboot | `quests-listen <chat id> <name> -- <command>` |
| `system/quests-ide.desktop` | "Quests IDE": the page in its own Firefox window (profile `quests-ide`, window class `QuestsIDE`), rainbow icon | Link: `~/.local/share/applications/quests-ide.desktop` |
| `../scripts/start-local.sh` | Starts one server, `start-local.sh <instance>` (used by the service) | |
| `../scripts/quests-update.sh` | The in-app Update: merges the original project's newest release into ours, rebuilds, pushes, restarts; rolls back on failure | Run by the page's Update button |
| `tests/headless.cjs` | Headless checks of the running page: live feed, pin, bottom, fast scroll, tabs, mode, plan, and the priority queue (queue, drag, next, latch, readonly, forest, ticketchat) | `node quests/tests/headless.cjs <check> <sessionId>` |
| `tools/set_window_class.py` | Gives an open X11 window the `QuestsIDE` class | |
| `tools/mockup.py` | The first throwaway mockup of the chat graph page | |
| `hooks/` | The hooks of the plugin: `queue_start.sh` (the rules at chat start), `queue_stop.sh` (a reply without its closing line goes back once), `rules.sh` (the reply format) | `plugin/hooks/hooks.json`, through `plugin/run.sh` |
| `plugin/` | The Claude Code plugin `quests@quests`: hooks and the skill finalize-chat | `claude plugin install quests@quests --scope user` (`INTERFACE.md`) |
| `lib/quests_env.py` | Which server a folder belongs to, and its environment | |
| `INTERFACE.md` | The contract between quests, the user and a repo | |
| `tools/rename_chat.mjs` | Names a chat in the one format, or lets Claude Haiku choose (`--haiku <text>`) | `node quests/tools/rename_chat.mjs <session id> "<name>"` |
| `tests/api.cjs` | Calls the running page's API as the user, for checks | `node quests/tests/api.cjs GET /api/quests/queue` |
| `priority-queue/` | The priority queue's requirements (Noam's words verbatim) and plan | |
| `examples/` | Use-case examples for the chat management design (side quest) | |

Setting up a new machine: clone, `npm install`, write `~/.config/quests/user.env` and one `<instance>.env` per server (`INTERFACE.md`), `npm run build`, `git remote add upstream https://github.com/siteboon/claudecodeui.git && git fetch upstream --tags`, link `system/quests-ui@.service` into `~/.config/systemd/user/`, `systemctl --user daemon-reload`, start `quests-ui@<instance>` and link it into `default.target.wants`, then install the plugin (`INTERFACE.md`).
