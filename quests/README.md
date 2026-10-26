# quests

Everything of the quests setup lives in this repo (fork of siteboon/claudecodeui). Feature list, by behavior:
`../local_features_noam.md`.

| Path | What | Installed as |
|---|---|---|
| `system/quests-ui.service` | The page's server as a user service, on 127.0.0.1:3001, started at login | Link: `~/.config/systemd/user/quests-ui.service`, enabled (`default.target.wants`) |
| `system/quests-ide.desktop` | "Quests IDE": the page in its own Firefox window (profile `quests-ide`, window class `QuestsIDE`), rainbow icon | Link: `~/.local/share/applications/quests-ide.desktop` |
| `../scripts/start-local.sh` | Starts the server (used by the service) | |
| `../scripts/quests-update.sh` | The in-app Update: merges the original project's newest release into ours, rebuilds, pushes, restarts; rolls back on failure | Run by the page's Update button |
| `tests/headless.cjs` | Headless checks of the running page: live feed, pin, bottom, fast scroll | `node quests/tests/headless.cjs <check> <sessionId>` |
| `tools/set_window_class.py` | Gives an open X11 window the `QuestsIDE` class | |
| `tools/mockup.py` | The first throwaway mockup of the chat graph page | |
| `hooks/queue_start.sh` | Priority queue: at every chat start, the closing-line rule, the chat's family, and (fresh start) the name rule | `~/.claude/settings.json`, SessionStart |
| `hooks/queue_stop.sh` | Priority queue: sends a reply without its closing line back to the chat once | `~/.claude/settings.json`, Stop |
| `tools/rename_chat.mjs` | Names a chat in the one format, or lets Claude Haiku choose (`--haiku <text>`) | `node quests/tools/rename_chat.mjs <session id> "<name>"` |
| `priority-queue/` | The priority queue's requirements (Noam's words verbatim) and plan | |
| `examples/` | Use-case examples for the chat management design (side quest) | |

Setting up a new machine: clone, `npm install && npm run build`, `git remote add upstream https://github.com/siteboon/claudecodeui.git && git fetch upstream --tags`, then create the two links above, `systemctl --user daemon-reload`, `systemctl --user enable --now quests-ui.service`.
