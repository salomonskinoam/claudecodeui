// quests: prints the last N normalized messages of a chat as the page receives them (type, role, head of content).
//   node quests/tests/history-peek.cjs <sessionId> [n]
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const [sessionId, nArg] = process.argv.slice(2);
const n = Number(nArg || 40);
const secret = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true })
  .prepare("select value from app_config where key like '%jwt%'").get().value;
const token = jwt.sign({ userId: 1, username: os.userInfo().username }, secret, { expiresIn: 600 });

(async () => {
  const response = await fetch(`http://127.0.0.1:3001/api/providers/sessions/${encodeURIComponent(sessionId)}/messages?limit=${n}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await response.json();
  const messages = json?.data?.messages ?? json?.messages ?? [];
  for (const m of messages) {
    const head = String(m.content ?? m.displayText ?? '').replace(/\s+/g, ' ').slice(0, 70);
    console.log([m.timestamp?.slice(11, 19), m.type, m.role ?? '', m.isToolUse ? `tool:${m.toolName}` : '', m.isThinking ? 'thinking' : '', head].join(' | '));
  }
  console.log('total', messages.length, 'keys', Object.keys(json?.data ?? json).join(','));
})();
