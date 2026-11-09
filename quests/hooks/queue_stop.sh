#!/usr/bin/env bash
# quests priority queue: Stop hook, wired from ~/.claude/settings.json.
# Every reply must end with the queue's closing line, and a turn with numbered items must end with a Summary of them
# (requirement 107, checks in summary_check.py). A failing reply goes back to the chat once.
in="$(cat)"
[ "$(jq -r '.stop_hook_active // false' <<<"$in")" = "true" ] && exit 0  # the second try passes
# Claude Code hands the reply to the hook; the transcript may not hold it yet when the hook runs.
# Bold labels count ("**Done:** ..."; Noam, 6 Nov: "bolden and put in separate lines the required from me and running").
last="$(jq -r '.last_assistant_message // ""' <<<"$in" | sed '/^[[:space:]]*$/d' | tail -n 1 | sed 's/\*\*//g')"
closing=""
grep -Eiq '^(waiting for|question|blocker|done)\b[ :]*.+' <<<"$last" || closing="Your reply has no queue closing line. Its last line was: ${last:0:200}"
summary="$(python3 -I "$(dirname "$0")/summary_check.py" <<<"$in")"
[ -z "$closing" ] && [ -z "$summary" ] && exit 0
[ -n "$closing" ] && echo "$closing" >&2
[ -n "$summary" ] && echo "$summary" >&2
cat >&2 <<EOF
Summary rule: the final message of a turn (the text after the last tool call) is the Summary and the closing lines, nothing else. It opens with the line **Summary**. Under it, every numbered item open or answered in this turn. First line "- **N.**" and the quote it answers, in quotation marks. An open item then has four sub-bullets: **History:** (what came before, his words quoted), **Context:** (what the thing is, full names, what is wrong), **Information:** (everything he needs to decide; he remembers nothing), **Question:** (one). An answered item: what was done or found and where. Then **Running:** and **Required from you:**, each on its own line.
Queue rule: the reply ends with one more line after "Running:" and "Required from you:". It is exactly one of:
  waiting for <what>   you wait for something that is not Noam (an eval, another chat)
  question <what>      Noam must answer; the question carries its background and history
  blocker <what>       you cannot go on; name only the open blockers
  Done <what>          your assignment is finished
Write the final message again, fixed.
EOF
exit 2
