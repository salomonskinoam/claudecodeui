#!/usr/bin/env bash
# quests plugin: runs one hook of the live quests code, the checkout of the quests server that serves this repo
# (QUESTS_CHECKOUT in ~/.config/quests/<instance>.env), so the copy of the plugin Claude Code caches holds no code
# that can go stale. QUESTS_HOME in ~/.config/quests/user.env is the checkout whose resolver picks the server.
# A repo opts in by its quests.json at the root (a worktree carries its own); without one, no hook runs.
# Usage (from hooks.json): run.sh <hook script name>. quests/INTERFACE.md.
set -u
[ -f "${CLAUDE_PROJECT_DIR:-}/quests.json" ] || exit 0
. "$HOME/.config/quests/user.env" || { echo "quests: ~/.config/quests/user.env is missing (quests/INTERFACE.md)" >&2; exit 2; }
env="$(python3 -I "$QUESTS_HOME/quests/lib/quests_env.py" --shell)" || exit 2
eval "$env"
exec "$QUESTS_CHECKOUT/quests/hooks/$1"
