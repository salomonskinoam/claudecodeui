We are ideating, not building. Your job in this chat: work out how quests should decide the priority of my chats and work items, and how the page should show that order. Deliver options and a recommendation, then stop. Do not change any code until I approve a plan.

What quests is. "quests" is my chat-management setup. It lives entirely in one repo: ~/src/quests/claudecodeui (GitHub salomonskinoam/claudecodeui, a fork of the open-source CloudCLI UI, remote "upstream" = siteboon/claudecodeui). Nothing of it belongs in the noam_worlds repo. It is a web page on http://localhost:3001 (user service quests-ui.service) that shows my Claude Code chats, including the ones I run in Cursor. Read these first, they are short: local_features_noam.md (every feature I asked for, by behavior, marked built or asked) and quests/README.md (where each piece lives).

The problem I am solving, in my own words: my mental bandwidth runs out from switching between many chats, approving each one and remembering all the details. Ideas and issues that come up inside a chat cause rabbit-holing instead of short chats that end. I want prioritization that can be set by a chat, by me manually, and automatically by an evolving, live policy, so that I only ever handle the first priority.

What exists today (built):
- Session list on the right, one lean row per chat, plus tabs per pane and a split screen.
- One status dot per chat, the same on tabs and in the list: blue = waiting for me (permission prompt or question), green = running, orange = finished while not on screen and not seen since, none = idle and seen.
- Sources of live state: Claude Code's own registry (~/.claude/sessions/*.json, one file per live process, status busy / waiting / idle, plus a waitingFor reason) for chats in Cursor or a terminal; the page's server for chats run from the page. Merged by GET /api/quests/live, polled every 2 seconds.
- Each chat's transcript (~/.claude/projects/<folder>/<session>.jsonl), its rename title (I name chats like "oct_07 rag4_ideation"), its last activity time, its project folder.
- A pinned last user message at the top of each chat.

Asked but not built (see local_features_noam.md, rows 10 and 34 to 37):
- Sort the session list by a rule I have not given yet. That rule is the main subject of this chat.
- Four use cases, caught in any wording inside any chat: backlog item (starts later when ranked, origin does not wait), side quest (starts now in its own chat, in parallel, reports back as one short note), blocker (starts now in its own chat, origin waits), question for me (the chat waits for me).
- A manager chat that ranks all work by an editable written policy, opens side quests and blockers as new chats, and brings me only the top item that needs me, with full context.
- A local store with its own git history as the log (not GitHub issues), and a graph view of chats with side quests and blockers under their origin.

A draft starting policy from an earlier discussion, to challenge, not to copy: 1. a chat that is stopped and waiting comes first (blocked by a subchat, then waiting on my answer, then waiting on a permission popup); 2. money already spent comes next (for example finished evaluations waiting for analysis); 3. then work on the world I named most recently; 4. ideas and improvements last, oldest first.

Questions to work through:
1. What "priority" means between chats, as opposed to inside one chat (inside a chat it stays the chat's own business).
2. Who can set or change it: the chat itself, me (for example drag, pin, or a word in the manager chat), and the policy; and which wins when they disagree.
3. When it is recomputed, and where it runs (in the page, in the server, in a manager chat, or a mix). Which parts must be deterministic and which can be LLM judgment.
4. Where priority and the policy are stored so nothing is lost on a disk failure (inside the repo, or a local store with git history) and so I can see why a chat got its rank.
5. How it is shown: sort order of the session list, sections (for example "needs you", "running", "done, unseen", "rest"), a rank or reason on each row, the order of tabs, the "needs you now" item, and how this fits the status dots without giving any dot or color a second meaning.
6. How it connects to the four use cases and the manager chat later, so the first version does not block them.

How to work and answer:
- Look at the code and data yourself (read-only) before proposing anything; check what each signal really contains.
- Before designing, search whether an existing tool or pattern already solves part of this, and say what you found.
- Compare options in tables, give one recommendation, and list every open decision as a numbered item with the context I need to decide it cold. Do not resolve design decisions for me.
- Short sentences, plain words, no abbreviations, full names of things. Start with the explanation and end with the conclusion.
