"""Makeshift quests page: live chats from `claude agents --json`, quests are MOCK data.
Run: python3 quests/tools/mockup.py  -> writes quests/tools/mockup.html next to it and opens it."""
import html, json, subprocess, time, webbrowser
from pathlib import Path
from urllib.parse import quote

OPEN = "cursor://anthropic.claude-code/open?"
chats = json.loads(subprocess.run(["claude", "agents", "--json"], capture_output=True, text=True, check=True).stdout)

# mock quests, keyed to real chat names where they exist
QUESTS = {
    "oct_07 rag4_ideation": dict(kind="main quest", status="waiting on you", prio="P0",
        children=[dict(title="side quest: keyed id shuffle into the SDK", kind="side quest",
                       status="not started", prio="P1")]),
    "oct_7 chat management": dict(kind="main quest", status="in progress", prio="P2", children=[]),
}
NEEDS_YOU = dict(chat="oct_07 rag4_ideation", prio="P0", title="rag4: a clearer name for the per-round runner",
    context="The server code that runs the student's code once per round (start a fresh sandboxed process, "
            "hand it the round's inputs, take back its one output, end the process) needs a clearer name.")
BACKLOG = [("P2", "labelnoise: ablation wave candidates"), ("P3", "distill: discuss the badly evaluated runs")]

def esc(s): return html.escape(str(s))
def start_link(title): return OPEN + "prompt=" + quote(f"MOCKUP TEST from the quests page, do nothing: {title}")

by_name = {c["name"]: c for c in chats}
rows = []
for c in sorted(chats, key=lambda c: c["name"] not in QUESTS):
    q = QUESTS.get(c["name"], {})
    rows.append(f'<tr><td>● {esc(c["name"])}</td><td class="{c["status"]}">{"working" if c["status"] == "busy" else "idle"}</td>'
                f'<td>{esc(q.get("status", "-"))}</td><td>{esc(q.get("prio", "-"))}</td>'
                f'<td><a href="{OPEN}session={c["sessionId"]}">open</a></td></tr>')
    for k in q.get("children", []):
        rows.append(f'<tr><td class="child">└─ ○ {esc(k["title"])} <span class="mock">mock</span></td><td>-</td>'
                    f'<td>{esc(k["status"])}</td><td>{esc(k["prio"])}</td><td><a href="{start_link(k["title"])}">start</a></td></tr>')
rows.insert(0, '<tr><td>○ manager <span class="mock">mock</span></td><td>-</td><td>-</td><td>-</td>'
               f'<td><a href="{start_link("manager")}">start</a></td></tr>')

n = NEEDS_YOU
needs_link = f'{OPEN}session={by_name[n["chat"]]["sessionId"]}' if n["chat"] in by_name else "#"
page = f"""<!doctype html><meta charset="utf-8"><title>Quests</title>
<style>
body{{font:15px system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;background:#fff;color:#222}}
h1{{font-size:20px}} h2{{font-size:15px;margin-top:28px;color:#555}}
.needs{{border:2px solid #c33;border-radius:8px;padding:12px 16px}}
table{{border-collapse:collapse;width:100%}} td,th{{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}}
.child{{padding-left:28px}} .busy{{color:#1a7f37;font-weight:600}} .idle{{color:#888}}
.mock{{font-size:11px;background:#fde68a;border-radius:4px;padding:1px 5px}}
@media (prefers-color-scheme:dark){{body{{background:#1e1e1e;color:#ddd}} td,th{{border-color:#333}} .mock{{color:#222}}}}
</style>
<h1>Quests <small style="color:#888;font-weight:400">· {len(chats)} chats live · {time.strftime('%H:%M')} · chats are live, quests are mock</small></h1>
<div class="needs"><b>NEEDS YOU NOW</b> <span class="mock">mock</span><br>
<b>{esc(n['prio'])}</b> {esc(n['title'])} — <a href="{needs_link}">open chat</a><p>{esc(n['context'])}</p></div>
<h2>CHAT GRAPH</h2><table><tr><th>chat</th><th>state</th><th>status</th><th>prio</th><th></th></tr>{''.join(rows)}</table>
<h2>BACKLOG <span class="mock">mock</span></h2><table>{''.join(f'<tr><td>{p}</td><td>{esc(t)}</td><td><a href="{start_link(t)}">start</a></td></tr>' for p, t in BACKLOG)}</table>
"""
out = Path(__file__).with_name("mockup.html")
out.write_text(page)
webbrowser.open(out.as_uri())
print(out)
