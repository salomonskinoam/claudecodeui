# The chat runner: chats that survive a restart of the page's server

## Objective

Restarting the page's server must not stop any work. Chats keep their turn, their subagents, their
background commands and their watchers. The page's server serves only the page. A separate process, the
runner, owns the Claude processes and so owns the work.

## The problem today

The page's server (`quests-ui.service`, one Node process) starts each chat's Claude process itself,
through the Agent SDK, as a child with pipes for input and output. Everything a chat runs hangs off that
child: subagents, background commands, monitors, workflows.

| Event | What happens now |
|---|---|
| `systemctl --user restart quests-ui.service` | systemd stops every process of the service, Claude processes included |
| A Claude process stops | every background command, agent and watcher it started stops with it |
| A turn is running | the turn is cut; the chat later reports "Background shell command didn't finish before the previous session ended" |
| The page reconnects | the new server has no record of the old runs: nothing to replay |

Chats run from Cursor are not affected: Cursor owns their processes.

Measured on 6 Nov 2026 at 17:37: one restart stopped the processes of the three chats the page ran. One
chat had 5 watchers, another a subagent. All of them stopped.

## Requirements

| # | Requirement |
|---|---|
| R1 | A restart of the page's server never stops a Claude process, a turn, or anything a chat started. |
| R2 | After that restart the page shows each running turn again, with no lost and no doubled rows. |
| R3 | Approvals, Stop, the workers panel, the queue's running state and the finish sound work as before. |
| R4 | The runner rarely needs a restart. When it does, it waits until no turn runs and no chat has live background work, then restarts. It never cuts work. |
| R5 | The browser code stays the same, except that it reconnects to the chat feed after a restart. |
| R6 | No new dependency. |

## Design

Two processes, two systemd services:

| | Page server (`quests-ui.service`) | Runner (`quests-runner.service`, new) |
|---|---|---|
| Owns | the page, the HTTP API, the queue, tickets, files, terminals | the Claude, Codex and Cursor processes of the page's chats |
| Code | everything except the chat runtime | `server/modules/providers` runtime, the run registry, approvals, background-task tracker |
| Restart | any time, for every change | only to change runner code, and only when idle (R4) |
| Listens on | port 3001, as now | a Unix socket, `$XDG_RUNTIME_DIR/quests-runner.sock`, owner-only |

### The chat feed

The browser keeps one WebSocket to the page server, as today. The page server forwards every chat frame
(`chat.send`, `chat.edit-send`, `chat.subscribe`, `abort`, the approval answers) to the runner. It also
forwards every event the runner sends back. The runner speaks the same frames the page server speaks now:
the forwarding is a copy, never a translation.

Replay already exists: every run has a `runId`, and each event carries a sequence number. After a restart
of the page server, the browser reconnects and subscribes again with its last `{runId, seq}`. The runner
replays what the browser missed. That gives R2.

### The state the page server reads

The queue, the tab dots, the workers panel and `/api/quests/live` read runtime state that lives in memory
today: the running runs, pending approvals, turns in flight, last steps, background tasks. The runner
exposes one call, `GET /state` on its socket, that returns all of it in one object. The page server
reads it every second and on every event it forwards, and keeps the last answer. Every current caller
reads that copy instead of the runtime module.

| Caller today | Reads now | Reads after |
|---|---|---|
| `queue/chats.ts` (`withPageRun`) | `chatRunRegistry`, `providerRuntimeService`, `isClaudeSDKTurnInFlight` | the state copy |
| `queue/work-state.ts` | `getClaudeSDKLastStep`, `isClaudeSDKTurnInFlight`, `chatRunRegistry.getRun` | the state copy |
| `server/index.ts` `/api/quests/live` | `chatRunRegistry.listRunningRuns`, pending approvals | the state copy |
| scheduled-message dispatcher | `providerRuntimeService` | sends `chat.send` to the runner |

### Runner restarts (R4)

`quests-runner.service` has `ExecReload` set to a drain. The drain makes the runner refuse new turns,
waits until no turn runs and no tracked background task is open, then exits. systemd then starts the new
code. A chat whose work never ends, such as a server it started in the background, keeps the drain
waiting. The drain prints which chats hold it, so the user can stop those chats or wait.

The page server's unit stays as it is. Its restart now stops only the page server.

## Implementation steps

Each step leaves the page working, and each step is one commit.

1. **Runner entry.** A new `server/runner.ts` starts the provider runtime, the run registry and the chat
   frame handler (`chat-websocket.service.ts`) on the Unix socket. It also adds `GET /state`. New unit
   `quests-runner.service` with the same login-shell start as `scripts/start-local.sh`, so chats keep the
   terminal's environment.
2. **Forwarding.** In the page server, `chat-websocket.service.ts` forwards chat frames to the runner
   socket and sends back what returns, one runner connection per browser connection. The page server no
   longer imports the provider runtime.
3. **State copy.** A new `server/modules/runner-client` keeps the `/state` copy. The four callers in the
   table read it.
4. **Reconnect.** The browser's chat socket resubscribes every open chat with its `{runId, seq}` after a
   reconnect. The run registry already stamps a `runId`; the browser starts keeping it per chat and sends it.
5. **Drain.** `ExecReload` for the runner, the drain itself, and its message naming the chats that hold it.
6. **Records.** REQUIREMENTS.md and local_features_noam.md rows. The deploy rule in the quests README:
   restart the page server freely; reload the runner only through the drain.

## Not in scope

Terminal panes (the shell WebSocket, `node-pty`) stay in the page server. A command run in a terminal
pane still stops when the page server restarts.

## Verification

| Check | How | Pass |
|---|---|---|
| A turn survives | a throwaway chat runs `sleep 90; echo done` in the foreground; restart the page server at second 20 | the turn finishes, its row shows "done", once |
| A background command survives | a throwaway chat starts `sleep 120` in the background and ends its turn; restart the page server | the task's report arrives at 120 s and starts a turn |
| A subagent survives | a throwaway chat starts a subagent that waits 60 s; restart the page server | the subagent's report arrives |
| Replay | headless: watch a running chat's rows, restart the page server, watch again | every row before the restart present once, same order, new rows only at the end |
| Queue and dots | headless `queue` and `focus` checks after the restart | they pass, and running chats are shown running |
| Drain | reload the runner while a throwaway chat has a background `sleep 60` | the reload waits, names that chat, then restarts after the sleep ends |
| Unit tests | the server tests of the run registry, the background tracker and the queue | all pass |

The throwaway chats run in a scratch folder and claim no ticket.
