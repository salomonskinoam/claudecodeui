# One service per chat, a manager that holds no work, listeners that wake their chat

Repository: `/home/noam/src/quests/claudecodeui`. Requirements 106, 108, 109 in `quests/priority-queue/REQUIREMENTS.md`.
Approved by Noam on 9 Nov 2026 and built the same day. It replaced the single runner (`quests-runner.service`, 6 Nov).

## Context

Today one process, `quests-runner.service` (`server/runner.ts`), holds every chat's Claude process. To update its
code it must wait until every chat is idle, which can take hours. A reboot or crash loses every turn, subagent and
background command, and nothing brings the chats back. Listeners started by chats (`systemd-run --user`, for
example shc-watch5 of "nov_05 #66") end without telling anyone, and they are gone after a reboot.

Noam, 9 Nov: "i want a true decoupling. the service managing all of this should be able to take updates while
things are running without killing them and things it manages should survive reboots and crashes."; "there should
be a re registration if either the manager or a child or both die, see if things ended, if they hang, if a refresh
is needed."; "chats that were open but not mid turn should also get opened again."; "listener silent should have a
listener circle ... but with a \"?\" inside."

Outcome:
- Each chat runs in its own user service. The page server is the manager. It holds no work and restarts any time.
- Every death (manager, chat, both, reboot) is found and repaired by one check.
- Listeners wake their chat when they end and come back after a reboot.
- The queue and the dots update at once.

## Design

| Part | What it is |
|---|---|
| Chat service | `server/runner.ts` started with `QUESTS_CHAT=<page session id>`, as the user unit `quests-chat-<id>` (`systemd-run --user`). Socket `/run/user/1000/quests/chat-<id>.sock`, mode 0600. It runs only that chat. The existing per-session code (run registry, replay buffer, approvals, background-work tracker, held process) is unchanged: every map in it is keyed by session id already. systemd refuses a second unit with the same name, so one chat can never have two processes. |
| Manager | The page server (`quests-ui.service`, enabled at boot). It starts chat services, routes the browser's `/ws` frames to them, merges their `/state`, runs the scheduled-message dispatcher, and runs the check. It holds no turn and no process. |
| Builds | `scripts/quests-update.sh` copies `dist-server` to `~/.local/share/quests/builds/<commit>/` (with a `node_modules` symlink to the repo). A new chat service starts from the newest build. A running one stays on its build. |
| Idle exit | A chat service with no run and no Claude process for 2 minutes exits. Its next message starts it on the newest build. This is how a refresh happens without waiting. |
| Records | New tables in `~/.cloudcli/auth.db` (WAL already on): `chat_hosts` and `listeners`. The chat service writes its own row, so the records survive the manager's death. |

`chat_hosts`: `session_id` PK, `unit`, `build`, `pid`, `started_at`, `turn_open` (0/1), `turn_started_at`,
`held` (0/1, a Claude process is alive between turns), `last_event_at` (written at most every 10 s),
`ended_at`, `wakes` (JSON list of wake times).

`listeners`: `id` PK, `session_id` (page id), `name`, `command`, `unit`, `log_path`, `started_at`, `ended_at`,
`exit_code`, `delivered_at`, `restarts`.

### Routing (from the protocol survey)

- `chat.send`, `chat.edit-send`, `chat.abort`, `chat.stop-task`: by `sessionId`. No service runs → start it, then send.
- `chat.subscribe`: split per entry of `sessions[]`; a session with no service answers `chat_subscribed` with `isProcessing:false` from the manager.
- `chat.permission-response`: carries only `requestId`. The manager keeps `requestId → sessionId` from outgoing `permission_request` events, and also from each service's `/state` approvals after a manager restart.
- `session_upserted` from a service: fanned out to every browser (`connectedClients`).
- Desktop notifications: the manager holds one `/desktop-notifications` connection per service and passes the frames to the browsers' notification sockets.
- The manager's own `protocol_error`s (null `sessionId`) are answered by the manager.
- `/api/agent` and git turns that already run inside the page server stay as they are (out of scope).

### The check (manager start, every 30 s, every service socket close)

One pure function `decide(rows, units, listeners, now) → actions`, in `server/modules/chat-hosts/reconcile.ts`.

| Case | Seen | Action |
|---|---|---|
| Manager died, services alive | units running, rows present | connect to each; read `/state`; rebuild the `requestId` map; the browsers reconnect and replay from the services' buffers |
| A service died, turn open or process held | unit gone, `turn_open=1` or `held=1`, no `ended_at` | start the service; send "Your process ended at <time> (crash or reboot). Its subagents, background commands and monitors died with it. Check what still runs and continue." |
| Both died (reboot) | same as above for every row | same action, for every chat that was mid-turn or held a process. Archived and on-hold chats are skipped. |
| Idle open chat | row with `turn_open=0`, `held=0` | nothing to start: its history is on disk and its next message starts it. It stays where it was in the queue. |
| Crash loop | 3 wakes within 1 hour | no more wakes; the chat goes to Pending chats with "keeps dying" |
| Stale row | unit gone, nothing open | write `ended_at` |
| Hung | `turn_open=1`, `last_event_at` older than 30 min, no live worker; or `/state` gives no answer in 10 s | red dot with "!", "may be hung" hint, Pending chats. Never killed by itself. |
| Listener ended | `ended_at` set, `delivered_at` empty | page chat: send "Listener <name> ended with exit code <n>. Last lines: ..." and set `delivered_at`. Chat open in Cursor: no message (we never type into Cursor), the chat goes to Pending chats with "listener ended". |
| Listener died without an exit (reboot) | no unit, no `ended_at` | start it again, `restarts += 1` |
| Listener silent | unit running, log unchanged for 2 hours | pink dot with "?" |
| Old build, idle | handled by idle exit | none |

### Listeners

- `quests/bin/quests-listen <chat id> <name> -- <command...>`: writes the `listeners` row, then starts
  `systemd-run --user --unit quests-listen-<id> quests/bin/quests-listen-run <id>`. The run wrapper runs the
  command with its output in `~/.local/state/quests/listeners/<id>.log`, then writes `ended_at` and `exit_code`.
  Python 3 stdlib (`sqlite3`), no new dependency.
- A listener must be safe to start again (a poll loop is). The command's help says so.
- A quests SessionStart hook tells every chat its id and the command. Nothing goes into noam_worlds.

### Dots

| State | Look |
|---|---|
| waiting for you | blue `#3B82F6` (unchanged) |
| running | green `#74c991`, pulsing (unchanged) |
| workers | purple `#a855f7`, pulsing (unchanged) |
| done, not seen | orange `#D97757` (unchanged) |
| listener runs | pink `#ec4899`, solid. Pink is far from every other dot. |
| listener silent | pink with a "?" inside (dot drawn at 12 px so the "?" is readable) |
| may be hung | red `#ef4444` with a "!" inside |

A chat whose last line says "waiting for" or "blocker" and has no process and no running listener goes to
Pending chats: nothing will wake it.

### Instant updates

- A chat service sends `{kind:'quests_state_changed'}` on its manager connection when a run starts or ends, an approval comes or goes, or its process starts or ends.
- The manager reads that service's `/state` and sends `{kind:'quests_live_changed'}` to every browser.
- The queue and the dots then read again at once.
- The closing lines of Cursor chats arrive through the stop hook into `queue_chats`. The manager checks `max(line_at)` every 1 s (one cheap sqlite read) and sends the same event.
- The browser polls drop from every 2 s to every 10 s, as a backup.

## As built (9 Nov 2026), where it differs from the plan

| Plan | Built |
|---|---|
| The old runner keeps its chats until they end | It held none when the switch came, so it was stopped and removed at once, with its unit, its proxy and its start script |
| The manager runs the scheduled-message dispatcher | Each chat service sends its own chat's due messages; the manager only starts the service of a chat with something due |
| Desktop notifications relayed from each chat service | Not relayed: only the Electron app uses that socket. ponytail: relay them if the Electron app is ever used |
| Hung: no event for 30 minutes | Hung: no transcript write and no event for 30 minutes, and no worker; Claude Code moves a long command to the background by itself, so a foreground command rarely hangs a turn |
| Listener changes found by the 30 s check | A listener that starts or ends triggers a check within a second |

Found on the way and fixed: the database setup copied the page id into every empty Claude id at each process start, so a chat whose first message started a chat service failed with "No conversation found" (`server/modules/database/migrations.ts`).

## Tests

- `server/modules/chat-hosts/tests/reconcile.test.ts`: one case per row of the check table, through `decide` alone.
- Router tests: subscribe split, `requestId` routing, `session_upserted` fan-out, a send to a chat with no service starts one.
- Existing tests re-run: `chat-run-registry`, `chat-background-subscribe`, `sessions.service`, `provider.routes`, scheduled messages.

## Verification (scratch probes in `/tmp/claude-1000/qr`, the throwaway project `/tmp/claude-1000/qr/proj`, never a Cursor chat)

1. A probe chat starts `sleep 300` in the background. Restart the manager. The chat service and the sleep still run, and the page shows the chat again.
2. A probe chat mid-turn: `systemctl --user kill quests-chat-<id>`. Within 30 s it is started again and gets the wake message.
3. Reboot without a reboot: stop the manager and every `quests-chat-*` unit, then start the manager. Every mid-turn or held chat is woken. Idle chats are untouched.
4. `quests-listen <probe> test -- bash -c 'sleep 20; exit 3'`: the chat gets "exit code 3"; the dot is pink, then gone.
5. Listener silent and hung, with the limits lowered by env for the probe: the "?" and "!" dots show, and the chat moves to Pending chats.
6. A code change: rebuild, a new chat starts on the new build while an old chat keeps its build; the old one moves to the new build after its idle exit.
7. Instant updates: `headless.cjs` measures from a send to the green dot, under 0.5 s.

Builds and typecheck under `nice -n 19` with the memory caps already used. Noam restarts `quests-ui.service`.

## Limits

- No process outlives a reboot. "Survive" means: found and woken. Subagents and background commands inside a dead process are started again by the woken chat, not by the manager.
- Each running chat costs one extra node process, about 100 MB. It exists only while the chat works or holds a process.
- A dependency change in `node_modules` reaches old builds too, through the symlink. ponytail: one shared `node_modules`; copy it per build if a dependency change ever breaks a running chat.
