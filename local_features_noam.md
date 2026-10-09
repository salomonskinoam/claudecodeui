# Local features (Noam)

Every feature asked for on top of CloudCLI UI, described by behavior and measured values only, so it can be rebuilt on any base or published. The reference look is Cursor with the Claude Code extension, on Linux, with the user's own Cursor theme.

Status: **built** (in this fork), **asked** (requested, not built yet).

## Layout

| # | Feature | Behavior | Status |
|---|---|---|---|
| 1 | Tabs per pane | Each pane has a row of chat tabs, like an editor. Clicking a chat in the session list opens it as a tab of the left pane. Clicking a tab shows that chat. × or a middle-click closes a tab; closing the active tab moves to the next one. Tabs survive a reload. Tabs drag: onto another tab (left half: before it, right half: after it) or onto the empty end of a row, within a pane or into the other pane; a tab dragged into a pane becomes its shown tab, the pane it left shows its next tab, a right pane left empty closes. A blue line marks the landing spot. | built |
| 2 | Tab colors | Active tab: background `#3d5984`, white text, 2 px red bottom edge `#ff0000`. Inactive tab: text `#dddddd`. | built |
| 3 | New-chat tab | "New Session" adds a "New chat" tab to the left pane. It stays when you switch to another tab. When the new chat sends its first message, that tab becomes the chat's own tab in the same place. A new chat keeps its input box after a reload (it starts in the project of the last chat tab, else the first project). | built |
| 4 | Split screen | Ctrl+click on a chat in the session list opens it as a tab of a right pane, which appears next to the left one. The right pane has its own tab row and a × that closes the whole pane. The same chat is never live in both panes: the right pane then shows "This chat is open in the left pane". | built |
| 5 | Draggable divider | The divider between the panes is a 1 px line `#454647`, blue on hover and while dragging, with a 9 px grab area. Each pane keeps at least 15% of the width. The split is remembered. | built |
| 6 | Pane arrows in the session list | Every chat open as a tab shows ◀ (left pane) or ▶ (right pane) in the session list; bold for the active tab of that pane, faded otherwise. | built |
| 7 | Session list on the right | The session list sits on the right edge of the window. Its resize handle is on its left edge; dragging left widens it. | built |
| 8 | Layout link | A link ending in `#panes=<json>` (`{left: [ids], right: [ids], rightActive: id}`) sets the tab layout, then removes itself from the address. | built |
| 9 | No chat header strip | The strip above the chat (chat title, project name, Chat / Shell / Files / Source Control buttons) is gone on desktop. Shell, Files and Source Control keep their header, so there is a way back to the chat. | built |
| 46 | Plans open as tabs | When a chat writes a plan (Claude Code saves it to ~/.claude/plans/<name>.md), the plan opens as its own tab right after that chat's tab, in the chat's pane, and is shown, rendered as markdown, like Cursor's plan preview. The tab re-reads the file every 3 seconds, so a revised plan shows. Only plans written while the chat is open count: plans already in its history never pop up, and a closed plan tab stays closed. Plan tabs drag like chat tabs. | built |
| 10 | Session list sort order | Sort the session list by a rule the user will give. | asked |

## Status dots

| # | Feature | Behavior | Status |
|---|---|---|---|
| 11 | One dot per chat, same everywhere | The same dot on the tab and in the session list. Blue `#3B82F6`: waiting for the user (permission prompt or question). Green `#74c991`, pulsing: running. Orange `#D97757`: finished while not on screen, not shown since. No dot: idle and already seen. Showing the chat in either pane clears orange. Blue and orange are the Claude Code extension's own tab dot colors; green is its timeline "success" color. | built |
| 12 | Dot sources | Chats running in an IDE or terminal: Claude Code's own session registry (one file per live process, status busy / waiting / idle). Chats run from this page: the page's server (a run in progress; a pending permission prompt). Refreshed every 2 seconds. | built |
| 13 | No other indicators | The app's own "changed in the last 10 minutes" dot and green row border, its amber attention dot and its purple background-work dot are removed. | built |

## Chat view

| # | Feature | Behavior | Status |
|---|---|---|---|
| 14 | Collapsed tool calls | Every tool call (and group of tool calls) shows as a 1 px gray line, clickable over 7 px. Clicking opens it; a line on top of an open one closes it again. Anything that waits for an answer (has an input field) never collapses. Collapsed from the first render, so the scroll height never jumps. | built |
| 15 | Response separator | No logo and no "Claude" name above a response. A bold 2 px horizontal line starts each response. When a response starts with a collapsed tool call, that line is drawn bold. | built |
| 16 | User messages | Full width on the left, no avatar. Background `#3c3c3c`, 1 px border `#575757`, corners about 4 px, text `#cccccc`. | built |
| 17 | Pinned user message | The last user message whose top has scrolled above the view stays pinned at the top of the chat, flush under the tab row with nothing showing above it, at the same width as the messages, in the user-message colors. Scrolling up hands the pin to the message before. As the next user message comes up under the pin, it pushes the pin up and out, so the two never overlap. Clicking the pin scrolls to the message. At most 3 lines. Only messages the user wrote count (system notices recorded as user messages are skipped). The message to pin is preloaded: when it is older than the loaded history, or when the loaded messages do not fill the pane, older history loads by itself. | built |
| 18 | Margins | Messages fill the pane width (no width cap, no centering): 48 px on the left, 32 px on the right, identical in both panes. | built |
| 19 | Live feed of IDE chats | A chat running in Cursor or the terminal updates in the page within a few seconds of each message, while it runs (native file-change events, not a 6 s poll; the page reloads the open chat on each change even though the chat counts as running elsewhere; it skips the reload only while the page itself streams the chat). Limit: an IDE chat shows whole messages; only chats run from the page stream word by word. | built |
| 20 | Smooth scrolling | No jump while scrolling, also fast and up into older history. Every loaded message is mounted and rendered for real (no off-screen placeholders, no estimated heights). Once the user scrolls (wheel, touch or keys), older history is fetched 3 screens before the top, 100 messages per page. When older messages are inserted above, the view keeps its position exactly, including a fast scroll made during the fetch. The status row at the top (loading / more to load) has one fixed height. Verified by a test: 56 fast 1500 px mouse-wheel steps up through 11 loads, zero jumps. | built |
| 44 | Opens at the bottom | Opening or reloading a chat shows its newest messages, at the very bottom. While the view is at the bottom (within 50 px) it stays there whatever grows: late rendering, older history loaded above, the running-chat indicator, new messages. Scrolling up by hand stops the following until the user comes back down. | built |
| 45 | Approval popup for chats in Cursor | When a chat running in Cursor (or a terminal) waits for an approval, the page shows the same "Permission required" popup as for its own chats, above the input box, with the full pending command. The prompt lives in Cursor's process and cannot be answered from the page, so the popup's one action brings the chat's Cursor tab to the front. Chats run from the page keep their own clickable Allow / Deny popup. Works in both panes. | built |

## Input box

| # | Feature | Behavior | Status |
|---|---|---|---|
| 21 | Input colors | Box `#3c3c3c`, 1 px border `#505050`, border `#ff7570` while typing, placeholder `#a6a6a6`, send button `#8a5351`. | built |
| 22 | Input sizes | One line when empty (grows while typing). Bottom row about 36 px, chips and buttons 26 px tall with 14 px text, not affected by the text-size setting. No "Enter to send" hint line. | built |
| 23 | Input spacing | 16 px under the box, 32 px at the sides, independent of window width, so both panes match. | built |

## Look

| # | Feature | Behavior | Status |
|---|---|---|---|
| 24 | Colors from Cursor | Background `#1E1F22`. Text `#cccccc` (headings, bold and tables included, never white). Gray text `#7f8081`. Session list `#1a1a1c`. Borders (tool boxes, tables, sidebar edge) `#454647`. Tool output and code blocks `#161718`. Links `#3794ff`. Inline code `#d7ba7d` on a faint light background, no backticks. Table headers bold and centered. | built |
| 25 | Fonts from Cursor | System UI font for all text (no serif in the chat); Droid Sans Mono for code. | built |
| 26 | Text size control | One base size; every text size in the app follows it. A slider (12 to 32 px, quarter-pixel steps) in the quick settings pane, Appearance section, row "Text size". Default 19.75 px (the user's Cursor chat size). Remembered; the right pane follows it live. | built |
| 27 | Lean session rows | One line per chat, 26 px tall, 30 px apart, no box, no logo, no message-count badge, no indent. Name 15 px `#cccccc`; age 12.5 px `#828283`; selected row `#00345e`; hover `#2a2d2e`. | built |
| 28 | Sidebar buttons | "New Session" faint (gray on a faint background), so it does not compete with the chats. | built |
| 29 | Rainbow icon | The browser tab icon is a rainbow square. A desktop entry "Quests IDE" with the same icon opens the app in its own Firefox window (own profile, own window class), so the taskbar shows it as its own app, not as Firefox. | built |

## Server and names

| # | Feature | Behavior | Status |
|---|---|---|---|
| 30 | This machine only | The server listens on 127.0.0.1 only (the default would open it to the network). | built |
| 31 | Patient permission prompts | A permission prompt waits up to 24 hours (the default denied it after 55 seconds). | built |
| 32 | Always running | Runs as a user service that starts at login and restarts on failure, independent of any chat. | built |
| 33 | Chat names as in Cursor | The page shows the same name as Cursor: the name set with rename (in the IDE or the CLI) first, else the title Claude Code generates by itself; either wins over a stored name. Only a chat with neither shows its first message. | built |
| 38 | Update = merge the original into ours | The in-app Update merges the original project's newest release into this fork, so our features stay on top, then rebuilds, pushes to the fork and restarts. It refuses on uncommitted changes, aborts on a merge conflict (listing the files), and on a failed build returns exactly to the version before and rebuilds it. A failed update never leaves a broken state. | built |
| 39 | Two versions | The version line shows the original project's version as the base plus ours on top: `CloudCLI v<base> + quests <N> (<commit>)`, where N is the number of our commits not in the original project. It links to the fork. | built |
| 40 | No community buttons | "Report Issue" and "Join Community" are removed (full and collapsed sidebar). | built |
| 41 | Permission mode shown | The mode button in the input box shows the current mode by name next to its icon (Default Mode, Auto Mode, Accept Edits, Bypass Permissions, Plan Mode). | built |
| 42 | Shift+Tab cycles the mode | Shift+Tab in the input box cycles the permission mode, as in Claude Code. Plain Tab does not. | built |
| 43 | Auto by default, per chat | A chat starts in Auto mode. Each chat keeps its own mode; the last mode picked no longer carries over to later chats. A mode picked in a new chat before its first message stays with that chat. | built |

## Chat management (the "quests" design)

Discussed in depth; no part is built yet.

| # | Feature | Behavior | Status |
|---|---|---|---|
| 34 | Four use cases, caught in any wording | **Backlog item**: starts later when ranked; the origin chat does not wait. **Side quest**: starts now in its own chat, in parallel; the origin (main quest) does not wait; its progress and questions never enter the origin chat; it reports back as one short note. **Blocker**: starts now in its own chat; the origin waits. **Question for the user**: the chat waits for the user. Recognized by intent, not fixed phrases. | asked |
| 35 | Manager chat | One always-open chat that ranks all work by an editable written policy, opens side quests and blockers as new chats, and brings the user only the top item that needs them, with full context. Chats keep explaining in full in their own window too. | asked |
| 36 | Local store and history | 100% local, its own git history as the log; not on GitHub. | asked |
| 37 | Graph view | A page showing the chats as a tree (side quests and blockers under their origin), each with live state, status and priority, and a way to open each chat. | asked |
