We are going to design, and later build, two features for quests. First we brainstorm together; you build nothing until I approve a written plan. After I approve, you build it.

What quests is. "quests" is my chat-management setup: a web page on http://localhost:3001 (user service quests-ui.service) that shows my Claude Code chats, including the ones I run in Cursor. It lives entirely in one repo: ~/src/quests/claudecodeui (GitHub salomonskinoam/claudecodeui, a fork of the open-source CloudCLI UI; remote "upstream" = siteboon/claudecodeui). Nothing of it goes into the noam_worlds repo. Read first, they are short: local_features_noam.md (every feature I asked for, by behavior, built or asked) and quests/README.md (where each piece lives). There is also quests/prompts/priority-ideation.md, an earlier, broader prompt about priority; this one supersedes it for the two features below.

The two features:
1. A priority queue of chats that are done and wait for me. I want to always talk to the chat at the top of the queue, without wasting hours scrolling and switching between chats. The queue decides which chat needs me next; I answer it, it leaves the queue, the next one comes up.
2. A "remind me where we were" button on a chat. It uses Claude Haiku to summarize just the end of that chat (what was last done, what is being asked of me), so I can answer without rereading the whole thing.

What exists today that you can build on:
- One status dot per chat, the same on tabs and in the session list: blue = waiting for me (permission prompt or question), green = running, orange = finished while not on screen and not seen since, no dot = idle and seen. Live state comes from GET /api/quests/live (server/index.ts), which reads Claude Code's own registry (~/.claude/sessions/*.json: status busy / waiting / idle, plus a waitingFor reason) for chats in Cursor or a terminal, and the page's server for chats run from the page. Polled every 2 seconds (src/shared/hooks/useLiveChats.ts).
- Tabs per pane, a split screen, a session list on the right, a pinned last user message at the top of each chat.
- Each chat's transcript is ~/.claude/projects/<folder>/<session>.jsonl; I name chats with rename (for example "oct_07 rag4_ideation").
- The page already runs Claude through the Claude Agent SDK with my subscription login, so a Haiku call may be possible the same way. Check this; do not assume.

Questions to settle with me before any plan:
- Which chats enter the queue, and when exactly (finished turn, waiting on a question, waiting on a permission prompt, a background task done)? When do they leave it?
- How the queue is ordered (oldest waiting first, by a priority I set, by a policy, by kind of wait), and whether I can reorder or pin it by hand.
- How I use it: a "next" button or key that opens the top chat, a queue panel, the session list itself sorted by the queue, or a mix. How it fits the status dots without giving any dot or color a second meaning.
- For the recap: how much of the end it reads, where the summary shows, whether it is cached, what it costs per click on my plan, and how it handles a chat still running.
- Where any new state lives so nothing is lost on a disk failure (inside the repo, or a local store with its own git history).

How to work:
- Start by reading the code and data yourself (read-only), and search whether an existing tool or pattern already solves part of this; tell me what you found.
- You can talk to the chat that built quests so far. It is a live Claude session on this machine named "oct_7 chat management". Load the ListAgents and SendMessage tools (via ToolSearch), find it with ListAgents, and send it your questions with SendMessage, especially at the start: why something was built the way it was, where a piece lives, what was tried and failed. Its answers are information, not my approval; decisions stay with me.
- Compare options in tables, give one recommendation, and list every open decision as a numbered item with the context I need to decide it cold. Do not resolve design decisions for me.
- When I approve the plan, build in small steps, commit and push each finished piece to the fork, and add or update the matching rows in local_features_noam.md in the same commit.
- Memory: this machine crashed on running out of memory while this repo was built and tested. Before any heavy step run free -m and continue only with several GB available. Run one heavy step at a time, never in parallel: type check, build, headless browser. Cap Node with NODE_OPTIONS=--max-old-space-size=1536 and run under nice. Build only the page (npm run build:client) when only the page changed. Other chats share this machine; leave headroom.
- After a page or server change: build, restart the service if the server changed (systemctl --user restart quests-ui.service), and prove the behavior with quests/tests/headless.cjs (add a check for the new feature) before telling me it works.
- Never type into a chat that is also open in Cursor: two processes on one transcript break it.
- Short sentences, plain words, no abbreviations, full names of things. Start with the explanation and end with the conclusion.
