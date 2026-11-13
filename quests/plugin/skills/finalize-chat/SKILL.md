---
name: finalize-chat
description: Close a chat. Runs the repo's own finish steps (the "finish" file its quests.json names), then summarizes the chat. Use when the user says "finalize this chat", "/quests:finalize-chat", "/finalize-chat", "close this chat", "wrap up" or "we are done here".
---

# finalize-chat

Calling this skill is the order to finish. Do not ask again.

1. Read the file named by `finish` in the repo's `quests.json` (at the repo root; a worktree has its own copy,
   quests/INTERFACE.md in the quests checkout). Do its steps in order. Its last step runs the repo's
   `finish_command`. Right before that step, do what another plugin's start text said to do there.
2. Say what the last step left. If it stopped, say what still holds the chat.
3. Summarize the chat for a reader who was not in it: what was asked, what was delivered (commit hashes,
   links), what was learned (say it when something believed before was proven wrong), what still runs,
   and what is still open for the user. Skip a line that has nothing. Claim only what the chat verified.
