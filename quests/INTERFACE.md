# quests: the interface

quests is a chat queue page and its server. Any repo can put its chats on a quests server by
adding a quests.json. This file is the contract between the three sides: quests, the user
and the repo.

## What quests owns and enforces

| Thing | Rule | Where |
|---|---|---|
| Reply ending | a `**Summary**` part, then `**Running:**`, then `**Required from you:**`, then the queue line | `quests/hooks/rules.sh`, checked by `queue_stop.sh` |
| Queue line | the last line, exactly one of: `waiting for <what>`, `question <what>`, `blocker <what>`, `Done <what>` | `rules.sh`, parsed by `server/modules/queue/sources/transcripts.ts` |
| Chat name | `<mon_dd> <area> <word> <word>`, plus ` #<ticket>` for a ticket's chat; the area is one of the repo's areas | `quests/tools/rename_chat.mjs` |
| Listeners | `quests-listen <session id> "<what>" -- <command>` | `quests/bin/quests-listen` |
| Tickets | the format below | the user's own tools; quests only reads tickets |

## The user side: `~/.config/quests/user.env`

Plain `KEY=value` lines. Every one is required. There is no built-in default.

| Key | Meaning | Example |
|---|---|---|
| `TICKETS_REPO` | the user's tickets repo on GitHub, `owner/name` | `ann/tickets` |
| `QUESTS_USER` | the user's name, as the chats address them | `Ann` |
| `QUESTS_TZ` | the user's time zone | `America/Asuncion` |
| `QUESTS_HOME` | the quests checkout whose resolver picks a chat's server (`quests/lib/quests_env.py`) | `/home/ann/src/quests/claudecodeui` |

### The tickets repo

The repo holds GitHub issues only. Run `quests/bin/quests-init-tickets <owner/name>` once to set it up.
It creates the labels. The server makes the `queue-state` branch itself; the repo needs one commit for it.
- Labels: `quest`, `sidequest`, `blocker` (the kind), `priority-high`, and one label per area of
  each repo whose chats open tickets.
- A claim is a comment that starts with `Claimed by chat <chat name>, session <session id>`.
- A body has the sections `## Parent chat`, `## History`, `## Context`, `## Done when`,
  `## Do not`, `## Allowed without asking`, `## Needs <QUESTS_USER>`, and, for a blocker,
  `## Blocks`.
- The queue order is backed up to `queue/order.json` on the `queue-state` branch.

## The server side: `~/.config/quests/<instance>.env`, one file per server

Any number of servers run side by side. Each one is the user unit `quests-ui@<instance>`
(`quests/system/quests-ui@.service`, linked into `~/.config/systemd/user/`). Each unit loads
`user.env` first and then this file, so a key here overrides one there.

| Key | Meaning | Example |
|---|---|---|
| `QUESTS_INSTANCE` | the server's name, the same as the file name | `demo` |
| `QUESTS_CHECKOUT` | the quests checkout the server runs from | `/home/ann/src/quests/claudecodeui` |
| `SERVER_PORT` | the page's port | `3002` |
| `DATABASE_PATH` | the server's database | `~/.config/quests/demo.db` |
| `QUESTS_UNIT_PREFIX` | names the chat and listener units (`<prefix>-chat-<id>`, `<prefix>-listen-<id>`), the socket folder `$XDG_RUNTIME_DIR/<prefix>` and the builds folder `~/.local/share/<prefix>/builds` | `quests-demo` |
| `PROJECT_ROOTS` | the repos this server serves, `:`-separated. Empty means every repo that no other server lists | `/home/ann/src/demo` |
| `TICKETS_REPO` | optional: this server's own tickets repo | `ann/demo-tickets` |

A UI connects to one server by its URL, `http://localhost:<SERVER_PORT>`. A build in a checkout
(`npm run build`) snapshots the new server code for every server whose `QUESTS_CHECKOUT` is that
checkout. A chat belongs to the server whose `PROJECT_ROOTS` hold its folder. A worktree of Claude
Code, `<repo>/.claude/worktrees/<name>`, belongs to its repo.

## The repo side: `quests.json` at the repo root

```json
{
  "areas": "cat areas.txt",
  "finish": "tools/finish.md",
  "finish_command": "tools/finish.sh",
  "drawer_question": "what is this chat about?"
}
```

| Key | Meaning |
|---|---|
| `areas` | a command, run at the repo root, that prints the repo's areas, one per line. An area is the second word of a chat name and a ticket's area label. The repo decides what an area is |
| `finish` | a markdown file with the repo's own closing steps, in order. `/quests:finalize-chat` follows it |
| `finish_command` | the command that is the last of those steps. Another plugin can hook a step in right before it, through its start text |
| `drawer_question` | the first question the Summary drawer offers about a chat |

The file is the opt-in. A repo without it gets no quests hook, even with the plugin on. A worktree
needs its own copy, or a link to the repo's.

## Installing the plugin, once per user

The marketplace is the quests checkout. The user turns the plugin on once, at user scope:

```
claude plugin marketplace add <QUESTS_HOME>
claude plugin install quests@quests --scope user
```

Every hook of the plugin runs the live code of the chat's server checkout (`quests/plugin/run.sh`).
So the copy of the plugin that Claude Code caches holds no code that can go stale. A change to a
skill needs a new `version` in `quests/plugin/.claude-plugin/plugin.json`.
