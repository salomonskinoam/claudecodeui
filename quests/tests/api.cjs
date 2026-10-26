// Call the running page's API as the user, for checks: node quests/tests/api.cjs <METHOD> <path> [json body]
// Signs a 10-minute login token with the app's own secret, the same way headless.cjs does.
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const [method, route, body] = process.argv.slice(2);
const secret = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true })
  .prepare("select value from app_config where key like '%jwt%'").get().value;
const token = jwt.sign({ userId: 1, username: os.userInfo().username }, secret, { expiresIn: 600 });

fetch(`http://127.0.0.1:3001${route}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body,
}).then(async (r) => {
  console.log(await r.text());
  process.exit(r.ok ? 0 : 1);
});
