#!/bin/bash
# quests: one chat's service (the user unit <prefix>-chat-<page session id>), started by the manager
# (server/modules/chat-hosts) with systemd-run and QUESTS_INSTANCE set. It loads that server's environment
# (quests/INTERFACE.md), runs the newest snapshot build of that server (scripts/snapshot-build.mjs) and keeps that
# build until it exits. Like start-local.sh it runs inside an interactive login shell, so the chat sees the same
# environment as one started from a terminal (API keys, PATH, nvm). Permission prompts wait up to 24 hours instead
# of the default 55 seconds.
set -e
eval "$(python3 -I "$(dirname "$(readlink -f "$0")")/../quests/lib/quests_env.py" --shell)"
build=$(readlink -f "$HOME/.local/share/$QUESTS_UNIT_PREFIX/builds/current")
cd "$build"
export QUESTS_CHAT="$1" QUESTS_BUILD="$(basename "$build")" CLAUDE_TOOL_APPROVAL_TIMEOUT_MS=86400000
exec bash -lic 'exec node dist-server/server/runner.js'
