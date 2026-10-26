#!/usr/bin/env bash
# quests priority queue: SessionStart hook (startup, resume, compact), wired from ~/.claude/settings.json.
# Prints the queue's rules into the chat: the closing line, the family to notify, and (fresh start only) the name.
# Exit 0 always: a failing gh must never block a chat start.
in="$(cat)"
sid="$(jq -r '.session_id // empty' <<<"$in")"
src="$(jq -r '.source // empty' <<<"$in")"
[ -n "$sid" ] || exit 0
cat <<'EOF'
Queue rule: every reply ends with one more line after "Running:" and "Required from you:". It is exactly one of:
  waiting for <what>   you wait for something that is not Noam (an eval, another chat)
  question <what>      Noam must answer; the question carries its background and history
  blocker <what>       you cannot go on; name only the open blockers
  Done <what>          your assignment is finished
A reply without this line is sent back to you once.
EOF
python3 - "$sid" <<'PY' 2>/dev/null
import json, re, subprocess, sys
sid = sys.argv[1]
R = "salomonskinoam/tickets"
CLAIM = re.compile(r"Claimed by chat (.+?), session ([0-9a-f-]{36})")
SID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b")

def gh(*a):
    return subprocess.run(["gh", *a], text=True, capture_output=True, check=True).stdout

hits = json.loads(gh("issue", "list", "-R", R, "--state", "open", "--search", f"{sid} in:comments", "--json", "number"))
if not hits:
    sys.exit(0)
NODE = "number title state comments(last: 50) { nodes { body } }"
q = """query($n: Int!) { repository(owner: "salomonskinoam", name: "tickets") { issue(number: $n) {
  %s body parent { %s subIssues(first: 50) { nodes { %s } } } subIssues(first: 50) { nodes { %s } } } } }""" % (NODE, NODE, NODE, NODE)
issues = [json.loads(gh("api", "graphql", "-f", f"query={q}", "-F", f"n={h['number']}"))["data"]["repository"]["issue"] for h in hits]
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
    name = re.search(r"Chat name[\s:|]*([^|\n]+)", m.group(1))  # "Chat name: X" or a table row "| Chat name | X |"
    if p_sid and p_sid != sid:
        parent = f"chat {name.group(1).strip() if name else '?'}, session {p_sid}"
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
      "(a commit, a push, an eval, a decision), and whenever Noam says to notify the family. "
      "A live chat (ListAgents) gets SendMessage; a chat that is not live gets a comment on its ticket.")
PY
if [ "$src" = startup ]; then
  cat <<EOF
Name rule: right after the worktree question (or first, where there is none), ask Noam for this chat's name with AskUserQuestion: "Name this chat: <mon_dd> <world> <2 word objective>". Offer two options: your proposed name, and "Let Haiku choose". Other lets him type. Keep the format. A chat that starts from a ticket (its first message is "we are starting this ticket <link>") adds " #<ticket number>" at the end. Then run:
  node ~/src/quests/claudecodeui/quests/tools/rename_chat.mjs $sid "<name>"
or, for Haiku:
  node ~/src/quests/claudecodeui/quests/tools/rename_chat.mjs $sid --haiku "<his first message>" [--ticket <number>]
EOF
fi
exit 0
