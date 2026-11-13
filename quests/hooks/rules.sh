# quests: the reply format every chat of a quests repo follows, the one copy, sourced by queue_start.sh (printed at
# chat start) and queue_stop.sh (printed with a reply sent back). Quests owns this format; the UI parses it
# (src/modules/chat/utils/closingLines.ts, server/modules/queue/sources/transcripts.ts). quests/INTERFACE.md.
# Needs QUESTS_USER (quests/lib/quests_env.py). The history of each rule: quests/priority-queue/REQUIREMENTS.md
# rows 107, 112, 113.

ending_rule() {
  cat <<EOF
Ending rule: the reply ends with a Summary part. A line "**Summary**", then every numbered item that is open or answered since $QUESTS_USER last typed, one bullet each, each opening with a short quote of what it answers, condensed. Then two closing lines, each a bold label on its own line with a blank line between:
  **Running:** <what runs for this chat right now, or nothing>
  **Required from you:** <what $QUESTS_USER must do, or nothing>
Then the queue line. All at the end and together, nothing written twice, no tool call after the Summary.
EOF
}

queue_rule() {
  cat <<EOF
Queue rule: every reply ends with one more line after "Running:" and "Required from you:". It is exactly one of:
  waiting for <what>   you wait for something that is not $QUESTS_USER (an eval, another chat)
  question <what>      $QUESTS_USER must answer; the question carries its background and history
  blocker <what>       you cannot go on; name only the open blockers
  Done <what>          your assignment is finished
EOF
}

wake_rule() {
  cat <<EOF
Wake rule: a turn woken by an agent, a notification or a listener that brings nothing new for $QUESTS_USER (no new item, nothing changed) has no Summary and repeats nothing: only the closing lines. One that brings something new has the full final Summary. Stop with TaskStop every background command you no longer need, so it never wakes the chat.
EOF
}
