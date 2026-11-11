#!/usr/bin/env bash
# quests priority queue: Stop hook, wired from ~/.claude/settings.json.
# Every reply must end with the queue's closing line, and a reply to Noam's message must have a Summary line
# (requirements 107, 112, 113). The hook only guards that they exist; the chat writes what the Summary holds. A failing reply goes back to the chat once.
in="$(cat)"
[ "$(jq -r '.stop_hook_active // false' <<<"$in")" = "true" ] && exit 0  # the second try passes
# Claude Code hands the reply to the hook; the transcript may not hold it yet when the hook runs.
# Bold labels count ("**Done:** ..."; Noam, 6 Nov: "bolden and put in separate lines the required from me and running").
last="$(jq -r '.last_assistant_message // ""' <<<"$in" | sed '/^[[:space:]]*$/d' | tail -n 1 | sed 's/\*\*//g')"
closing=""
grep -Eiq '^(waiting for|question|blocker|done)\b[ :]*.+' <<<"$last" || closing="Your reply has no queue closing line. Its last line was: ${last:0:200}"
# A turn woken by an agent, a notification or a listener writes a Summary only when it brings something new
# (requirement 113); the chat decides, the hook checks only turns that answer Noam.
summary=""
tp="$(jq -r '.transcript_path // ""' <<<"$in")"
[ -n "$tp" ] && [ "$(python3 -I "$(dirname "$0")/woken_by.py" "$tp")" = event ] ||
jq -r '.last_assistant_message // ""' <<<"$in" | grep -Eq '^[[:space:]]*(\*\*)?Summary:?(\*\*)?:?[[:space:]]*$' || summary="Your reply has no \"**Summary**\" line."
[ -z "$closing" ] && [ -z "$summary" ] && exit 0
[ -n "$closing" ] && echo "$closing" >&2
[ -n "$summary" ] && echo "$summary" >&2
cat >&2 <<EOF
Summary rule (the noam output style, "Ending"): the reply ends with a Summary part: every numbered item that is OPEN or ANSWERED in this turn, one bullet each, each written as "Shape of an item that passed the gate" and "Short or complete" say, condensed. Then the two closing lines, bold, each on its own line. All at the end and together, nothing written twice, no tool call after the Summary. Every item opens with a short quote of what it answers.
Noam, 10 Nov: "it's fine and good that each stop hook has its turns' items. but the final one should actually be about everything since the last time the user typed if not more." and "as long as when the queue tells me the chat is ready for me, i get the final summary with everything, and once of everything."
Wake rule: a turn woken by an agent, a notification or a listener that brings nothing new for Noam (no new item, nothing changed) has no Summary and repeats nothing: only the closing lines. One that brings something new has the full final Summary. Stop with TaskStop every background command you no longer need, so it never wakes the chat. Noam, 10 Nov, on a woken reply that repeated the last Summary: "suplicated summary. we dont want that".
Queue rule: the reply ends with one more line after "Running:" and "Required from you:". It is exactly one of:
  waiting for <what>   you wait for something that is not Noam (an eval, another chat)
  question <what>      Noam must answer; the question carries its background and history
  blocker <what>       you cannot go on; name only the open blockers
  Done <what>          your assignment is finished
Write the final message again, fixed.
EOF
# The event log (requirement 120): which reply went back, and why.
python3 -I "$(dirname "$0")/log_event.py" hook stop.sentBack "$(jq -r '.session_id // ""' <<<"$in")" "$(jq -cn --arg closing "$closing" --arg summary "$summary" '{closing: $closing, summary: $summary}')"
exit 2
