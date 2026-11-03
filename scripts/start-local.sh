#!/bin/bash
# quests: run this fork on this machine only (the default host 0.0.0.0 would expose it to the network).
# Permission prompts wait up to 24 hours instead of the default 55 seconds.
# Build first with `npm install && npm run build`.
#
# The service starts from systemd with an empty environment. A chat started from this server must see the
# same environment as a chat started from a terminal (API keys, PATH, nvm), so the server runs inside an
# interactive login shell: that runs ~/.profile and ~/.bashrc in full, whose early return is for
# non-interactive shells only.
cd "$(dirname "$0")/.." || exit 1
exec bash -lic 'HOST=127.0.0.1 SERVER_PORT=3001 CLAUDE_TOOL_APPROVAL_TIMEOUT_MS=86400000 exec npm run server'
