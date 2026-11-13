#!/bin/bash
# quests: run one quests server on this machine only (the default host 0.0.0.0 would expose it to the network).
# Usage: start-local.sh <instance>, the name of ~/.config/quests/<instance>.env (quests/INTERFACE.md).
# Permission prompts wait up to 24 hours instead of the default 55 seconds.
# Build first with `npm install && npm run build`.
#
# The service starts from systemd with an empty environment. A chat started from this server must see the
# same environment as a chat started from a terminal (API keys, PATH, nvm), so the server runs inside an
# interactive login shell: that runs ~/.profile and ~/.bashrc in full, whose early return is for
# non-interactive shells only. The server's own environment is loaded after it, so the login shell cannot change it.
cd "$(dirname "$0")/.." || exit 1
[ -n "${1:-}" ] || { echo "usage: start-local.sh <instance>" >&2; exit 1; }
export QUESTS_INSTANCE="$1"
exec bash -lic 'eval "$(python3 -I quests/lib/quests_env.py --shell)" && HOST=127.0.0.1 CLAUDE_TOOL_APPROVAL_TIMEOUT_MS=86400000 exec npm run server'
