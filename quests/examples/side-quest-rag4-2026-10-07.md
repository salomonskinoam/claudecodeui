# Example: side quest (rag4 chat, 2026-10-07)

Source chat: "oct_07 rag4_ideation", session ca4dafba-24df-44cf-9c89-8f35ded59aae, user turn at 2026-10-07T21:36:20Z.

## What came before
The chat was designing a new task, rag4. That design is the main quest. In item 78 the chat found that two worlds, rag and rag_gen, each carry their own copy of a keyed id shuffle (worlds/rag/bundle.py, worlds/rag_gen/setup_data.py). It proposed one SDK construct, where each world supplies only which ids to shuffle.

## The user's words
> 78. good that you found about rag, let's extract it from there too into some sdk construct that plays together well with the other components of the system. no later opt in, because the rag tasks are still under work. the yesses remain yesses without rerunning.
>
> the above should run in parallel, and not pollute this chat, because it's a side quest.
>
> As for the main quest,
> 79. so we need to come up with a much clearer name for that object.

## Why this is a side quest
| Property | Value here |
|---|---|
| Starts | now |
| Main quest waits for it | no. The main quest moves on to item 79 in the same message |
| Scope | clear and self-contained: lift the shuffle into the SDK, move rag and rag_gen onto it, keep their verdicts |
| Must not | put its progress, its output dumps or its questions into the main chat |
| Result | comes back to the main quest later, as one short note |

## Not to confuse with
| Use case | Starts | Origin chat waits |
|---|---|---|
| backlog item | later, when ranked | no |
| side quest | now, in parallel | no |
| blocker | now | yes |
| question for the user | now | yes, for the user's answer |
