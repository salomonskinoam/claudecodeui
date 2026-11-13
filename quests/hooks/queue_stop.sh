#!/usr/bin/env bash
# quests priority queue: Stop hook, wired by the quests plugin (hooks.json).
# Every reply must end with the queue's closing line, and a reply to the user's message must have a Summary line
# (requirements 107, 112, 113). The hook only guards that they exist; the chat writes what the Summary holds. A failing reply goes back to the chat once.
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
in="$(cat)"
[ "$(jq -r '.stop_hook_active // false' <<<"$in")" = "true" ] && exit 0  # the second try passes
eval "$(python3 -I "$HERE/../lib/quests_env.py" --shell)" || exit 2
# Claude Code hands the reply to the hook; the transcript may not hold it yet when the hook runs.
# Bold labels count ("**Done:** ..."; Noam, 6 Nov: "bolden and put in separate lines the required from me and running").
last="$(jq -r '.last_assistant_message // ""' <<<"$in" | sed '/^[[:space:]]*$/d' | tail -n 1 | sed 's/\*\*//g')"
closing=""
grep -Eiq '^(waiting for|question|blocker|done)\b[ :]*.+' <<<"$last" || closing="Your reply has no queue closing line. Its last line was: ${last:0:200}"
# A turn woken by an agent, a notification or a listener writes a Summary only when it brings something new
# (requirement 113); the chat decides, the hook checks only turns that answer the user.
summary=""
tp="$(jq -r '.transcript_path // ""' <<<"$in")"
[ -n "$tp" ] && [ "$(python3 -I "$HERE/woken_by.py" "$tp")" = event ] ||
jq -r '.last_assistant_message // ""' <<<"$in" | grep -Eq '^[[:space:]]*(\*\*)?Summary:?(\*\*)?:?[[:space:]]*$' || summary="Your reply has no \"**Summary**\" line."
[ -z "$closing" ] && [ -z "$summary" ] && exit 0
[ -n "$closing" ] && echo "$closing" >&2
[ -n "$summary" ] && echo "$summary" >&2
# shellcheck source=rules.sh
. "$HERE/rules.sh"
{ ending_rule; wake_rule; queue_rule; echo "Write the final message again, fixed."; } >&2
# The event log (requirement 120): which reply went back, and why.
python3 -I "$HERE/log_event.py" hook stop.sentBack "$(jq -r '.session_id // ""' <<<"$in")" "$(jq -cn --arg closing "$closing" --arg summary "$summary" '{closing: $closing, summary: $summary}')"
exit 2
