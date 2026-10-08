#!/bin/sh
# quests: run this fork on this machine only (the default host 0.0.0.0 would expose it to the network).
# Permission prompts wait up to 24 hours instead of the default 55 seconds.
# Build first with `npm install && npm run build`.
cd "$(dirname "$0")/.." || exit 1
HOST=127.0.0.1 SERVER_PORT=3001 CLAUDE_TOOL_APPROVAL_TIMEOUT_MS=86400000 exec npm run server
