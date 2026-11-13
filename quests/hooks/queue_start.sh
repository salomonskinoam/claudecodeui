#!/usr/bin/env bash
# quests priority queue: SessionStart hook (startup, resume, compact), wired by the quests plugin (hooks.json), run
# only in a repo with a quests.json (quests/plugin/run.sh). Prints the queue's rules into the chat: the reply format
# (rules.sh), the family to notify, and (fresh start only) the name, with the repo's areas from its quests.json
# (quests/INTERFACE.md). A failing gh never blocks a chat start.
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
ROOT="$(dirname "$HERE")"
in="$(cat)"
sid="$(jq -r '.session_id // empty' <<<"$in")"
src="$(jq -r '.source // empty' <<<"$in")"
[ -n "$sid" ] || exit 0
eval "$(python3 -I "$HERE/../lib/quests_env.py" --shell)" || exit 2
manifest="$CLAUDE_PROJECT_DIR/quests.json"
areas="$(cd "$CLAUDE_PROJECT_DIR" && bash -c "$(jq -r '.areas' "$manifest")" | paste -sd' ' -)"
# shellcheck source=rules.sh
. "$HERE/rules.sh"
queue_rule
echo "A reply without this line is sent back to you once."
ending_rule
wake_rule
cat <<EOF
Listener rule: to wait for something outside this chat (an eval, a job, a file), start a listener, never a bare background loop or systemd-run:
  $ROOT/bin/quests-listen $sid "<what it waits for>" -- <command that polls until it is done>
It outlives this chat's process and reboots, and when it ends this chat gets a message with its exit code and the last lines of its log. It may be started again after a reboot, so the command must be safe to run twice. Stop one for good with: quests-listen --stop <listener id>
Never wait with Monitor or a background command either: every event and every expiry of one starts a turn, and each such turn repeats your last reply.
Agent rule: an agent you start in the background reports by ending its turn; its end reaches you as a notification. Tell it in its prompt never to SendMessage you its results: a message and the end notification wake you twice, and you write the same reply twice.
EOF
python3 - "$sid" <<'PY' 2>/dev/null
import json, os, re, subprocess, sys
sid = sys.argv[1]
R = os.environ["TICKETS_REPO"]
USER = os.environ["QUESTS_USER"]
CLAIM = re.compile(r"Claimed by chat (.+?), session ([0-9a-f-]{36})")
SID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b")

def gh(*a):
    return subprocess.run(["gh", *a], text=True, capture_output=True, check=True).stdout

hits = json.loads(gh("issue", "list", "-R", R, "--state", "open", "--search", f"{sid} in:comments", "--json", "number"))
if not hits:
    sys.exit(0)
NODE = "number title state comments(last: 50) { nodes { body } }"
q = """query($n: Int!, $owner: String!, $name: String!) { repository(owner: $owner, name: $name) { issue(number: $n) {
  %s body parent { %s subIssues(first: 50) { nodes { %s } } } subIssues(first: 50) { nodes { %s } } } } }""" % (NODE, NODE, NODE, NODE)
owner, name = R.split("/")
issues = [json.loads(gh("api", "graphql", "-f", f"query={q}", "-F", f"n={h['number']}", "-f", f"owner={owner}", "-f", f"name={name}"))["data"]["repository"]["issue"] for h in hits]
own = next((i for i in issues if not i["parent"]), issues[0])

def chat(issue):  # the newest claim on an open ticket
    claims = [m for c in issue["comments"]["nodes"] for m in CLAIM.findall(c["body"])]
    return claims[-1] if claims and issue["state"] == "OPEN" else None

def show(issue):
    c = chat(issue)
    return f"#{issue['number']} {issue['title']}: chat {c[0]}, session {c[1]}" if c else None

parent = None
m = re.search(r"## Parent chat(.*?)(\n## |\Z)", own["body"], re.S)
if m:
    p_sid = (SID.findall(m.group(1)) or [None])[0]
    pname = re.search(r"Chat name[\s:|]*([^|\n]+)", m.group(1))  # "Chat name: X" or a table row "| Chat name | X |"
    if p_sid and p_sid != sid:
        parent = f"chat {pname.group(1).strip() if pname else '?'}, session {p_sid}"
sibs = [s for s in ((own["parent"] or {}).get("subIssues", {}).get("nodes", [])) if s["number"] != own["number"]]
sibs = [x for x in map(show, sibs) if x]
kids = [x for x in map(show, own["subIssues"]["nodes"]) if x]
if not (parent or sibs or kids):
    sys.exit(0)
print(f"Your family (own ticket #{own['number']}):")
if parent:
    print(f"  Parent: {parent}")
for s in sibs:
    print(f"  Sibling: {s}")
for k in kids:
    print(f"  Child: {k}")
print("Family rule: tell these chats when the kind of your closing line changes, when your ticket gets an update "
      f"(a commit, a push, an eval, a decision), and whenever {USER} says to notify the family. "
      "A live chat (ListAgents) gets SendMessage; a chat that is not live gets a comment on its ticket.")
PY
if [ "$src" = startup ]; then
  cat <<EOF
Name rule: right after the repo's own start questions (or first, where there are none), ask $QUESTS_USER for this chat's name with AskUserQuestion: "Name this chat: <mon_dd> <area> <2 word objective>", where <area> is one of this repo's areas: $areas. Offer two options: your proposed name, and "Let Haiku choose". Other lets them type. Keep the format. A chat that starts from a ticket (its first message is "claim this ticket <link>") adds " #<ticket number>" at the end. Then run:
  node $ROOT/tools/rename_chat.mjs $sid "<name>"
or, for Haiku:
  node $ROOT/tools/rename_chat.mjs $sid --haiku "<their first message>" [--ticket <number>]
EOF
fi
exit 0
