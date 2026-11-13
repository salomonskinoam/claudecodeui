# Example: side quest

## What came before
A chat was designing a new feature. That design is the main quest. In item 78 the chat found that two
other modules each carry their own copy of the same helper, and proposed one shared copy.

## The user's words, in short
In one message the user answered item 78: move the helper into one shared place, run that in parallel
and keep it out of this chat, "because it's a side quest". In the same message they went on with the
main quest, item 79.

## Why this is a side quest
| Property | Value here |
|---|---|
| Starts | now |
| Main quest waits for it | no. The main quest moves on to item 79 in the same message |
| Scope | clear and self-contained: move the helper into one shared place, move both modules onto it |
| Must not | put its progress, its output dumps or its questions into the main chat |
| Result | comes back to the main quest later, as one short note |

## Not to confuse with
| Use case | Starts | Origin chat waits |
|---|---|---|
| backlog item | later, when ranked | no |
| side quest | now, in parallel | no |
| blocker | now | yes |
| question for the user | now | yes, for the user's answer |
