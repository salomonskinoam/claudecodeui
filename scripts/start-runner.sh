#!/bin/bash
# quests: the chat runner (server/runner.ts), started by quests-runner.service. Like start-local.sh it runs inside
# an interactive login shell, so a chat started here sees the same environment as one started from a terminal
# (API keys, PATH, nvm). Node is exec'd directly, so the service's SIGTERM reaches the runner and starts its drain.
# Permission prompts wait up to 24 hours instead of the default 55 seconds.
cd "$(dirname "$0")/.." || exit 1
exec bash -lic 'CLAUDE_TOOL_APPROVAL_TIMEOUT_MS=86400000 exec node dist-server/server/runner.js'
