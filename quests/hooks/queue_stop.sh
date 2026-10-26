#!/usr/bin/env bash
# quests priority queue: Stop hook, wired from ~/.claude/settings.json.
# Every reply must end with the queue's closing line; a reply without it goes back to the chat once.
in="$(cat)"
[ "$(jq -r '.stop_hook_active // false' <<<"$in")" = "true" ] && exit 0  # the second try passes
# Claude Code hands the reply to the hook; the transcript may not hold it yet when the hook runs.
last="$(jq -r '.last_assistant_message // ""' <<<"$in" | sed '/^[[:space:]]*$/d' | tail -n 1)"
grep -Eiq '^(waiting for|question|blocker|done)\b[ :]*.+' <<<"$last" && exit 0
cat >&2 <<EOF
Your reply has no queue closing line. Its last line was: ${last:0:200}
Queue rule: every reply ends with one more line after "Running:" and "Required from you:". It is exactly one of:
  waiting for <what>   you wait for something that is not Noam (an eval, another chat)
  question <what>      Noam must answer; the question carries its background and history
  blocker <what>       you cannot go on; name only the open blockers
  Done <what>          your assignment is finished
Repeat the end of your reply with that line added.
EOF
exit 2
