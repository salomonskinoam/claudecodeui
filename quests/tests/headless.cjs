// quests: headless checks of the running page (http://127.0.0.1:3001), in Chrome via playwright-core.
// Read-only: opens one chat, never types in it. Logs in with a 10-minute token signed by the app's own secret.
//
//   node quests/tests/headless.cjs <check> <sessionId>
//
//   live    every 2 s for 60 s: the last message's time and text (run while the chat is working in Cursor:
//           it must change within a few seconds of each step)
//   pin     scroll to six positions; the pinned user message must show text at each
//   bottom  scroll to the bottom and watch 18 s: must stay 0 px from the bottom, no endless loading
//   scroll  fast scroll up, 1500 px every 60 ms, to the top: a reference row must move exactly 1500 px each
//           step, also on steps where older history lands (prints jumps; [] means none)
//   mode    the permission mode button: start mode, after Shift+Tab, after plain Tab (must not change)
//   tabs    sets a layout (left: <sessionId> + the 2 next chats, right: 1 more), drags tabs between and within
//           panes, prints the stored layout after each drag. Restores no layout: use a fresh browser profile.
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const [check, sessionId] = process.argv.slice(2);
if (!['live', 'pin', 'bottom', 'scroll', 'tabs', 'mode'].includes(check) || !sessionId) {
  console.error('usage: node quests/tests/headless.cjs live|pin|bottom|scroll|tabs|mode <sessionId>');
  process.exit(2);
}
const secret = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true })
  .prepare("select value from app_config where key like '%jwt%'").get().value;
const token = jwt.sign({ userId: 1, username: os.userInfo().username }, secret, { expiresIn: 600 });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('auth-token', t), token);
  await page.goto(`http://127.0.0.1:3001/session/${sessionId}`);
  await page.waitForTimeout(6000);
  const pane = page.locator('.chat-messages-pane');

  if (check === 'live') {
    let previous = '';
    for (let i = 0; i < 30; i++) {
      const last = await pane.evaluate((p) => {
        const rows = p.querySelectorAll('[data-message-timestamp]');
        const row = rows[rows.length - 1];
        return row ? `${row.dataset.messageTimestamp} | ${row.textContent.replace(/\s+/g, ' ').slice(0, 60)}` : '';
      });
      if (last !== previous) console.log(new Date().toISOString().slice(11, 19), last);
      previous = last;
      await page.waitForTimeout(2000);
    }
  }

  if (check === 'pin') {
    for (const f of [0.15, 0.35, 0.55, 0.75, 0.9, 0.05]) {
      await pane.evaluate((p, y) => { p.scrollTop = y; }, Math.round((await pane.evaluate((p) => p.scrollHeight)) * f));
      await page.waitForTimeout(4000);
      const pin = await page.evaluate(() => document.querySelector('.quests-sticky-user')?.textContent?.slice(0, 60) ?? '(no pin)');
      console.log('at', f, 'pin:', JSON.stringify(pin));
    }
  }

  if (check === 'bottom') {
    await pane.evaluate((p) => { p.scrollTop = p.scrollHeight; });
    let previous = '';
    for (let i = 0; i < 60; i++) {
      const s = await pane.evaluate((p) => `gap=${Math.round(p.scrollHeight - p.scrollTop - p.clientHeight)} messages=${p.querySelectorAll('.chat-message').length}`);
      if (s !== previous) console.log((i * 0.3).toFixed(1) + 's', s);
      previous = s;
      if (i === 20) await pane.evaluate((p) => { p.scrollTop = p.scrollHeight; });
      await page.waitForTimeout(300);
    }
  }

  if (check === 'scroll') {
    await pane.evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await page.waitForTimeout(1500);
    console.log(JSON.stringify(await pane.evaluate(async (p) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const out = { steps: 0, loads: 0, jumps: [] };
      let count = p.querySelectorAll('.chat-message').length;
      while (p.scrollTop > 0 && out.steps < 150) {
        const top = p.getBoundingClientRect().top;
        const rows = Array.from(p.querySelectorAll('.chat-message'));
        const marker = rows.find((m) => m.getBoundingClientRect().top >= top) || rows[0];
        const before = marker.getBoundingClientRect().top;
        const step = Math.min(1500, p.scrollTop);
        p.scrollTop -= step;
        await frame(); await frame();
        const moved = marker.getBoundingClientRect().top - before;
        const now = p.querySelectorAll('.chat-message').length;
        if (now !== count) { out.loads++; count = now; }
        if (Math.abs(moved - step) > 2) out.jumps.push(Math.round(moved - step));
        out.steps++;
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      return out;
    })));
  }

  if (check === 'tabs') {
    const others = (await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/session/"]'))
      .map((a) => a.getAttribute('href').slice(9)))).filter((id) => id !== sessionId).slice(0, 3);
    await page.evaluate(([a, b, c, d]) => {
      localStorage.setItem('quests-panes', JSON.stringify({ left: [a, b, c], right: [d], rightActive: d }));
      window.dispatchEvent(new Event('quests-panes-change'));
    }, [sessionId, ...others]);
    await page.waitForTimeout(3000);
    const short = (ids) => ids.map((id) => id.slice(0, 4));
    const layout = async (label) => {
      const p = await page.evaluate(() => JSON.parse(localStorage.getItem('quests-panes')));
      console.log(label.padEnd(34), 'left', JSON.stringify(short(p.left)), 'right', JSON.stringify(short(p.right)), 'rightActive', (p.rightActive || '').slice(0, 4), 'url', page.url().split('/').pop().slice(0, 4));
    };
    const rows = page.locator('div.h-9:has(> [draggable="true"])');
    await layout('start');
    await rows.nth(0).locator('[draggable="true"]').nth(1).dragTo(rows.nth(1).locator('[draggable="true"]').nth(0), { targetPosition: { x: 150, y: 10 } });
    await page.waitForTimeout(1500); await layout('left #2 -> right, after its tab');
    await rows.nth(0).locator('[draggable="true"]').nth(1).dragTo(rows.nth(0).locator('[draggable="true"]').nth(0), { targetPosition: { x: 5, y: 10 } });
    await page.waitForTimeout(1500); await layout('left #2 -> before left #1');
    await rows.nth(1).locator('[draggable="true"]').nth(1).dragTo(rows.nth(0).locator('[draggable="true"]').nth(0), { targetPosition: { x: 5, y: 10 } });
    await page.waitForTimeout(1500); await layout('right #2 -> before left #1');
  }

  if (check === 'mode') {
    const button = page.locator('button[title$="(Shift+Tab)"]');
    console.log('mode shown:', await button.innerText());
    await page.locator('[data-slot="prompt-input-textarea"]').first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(300);
    console.log('after Shift+Tab:', await button.innerText());
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    console.log('after plain Tab:', await button.innerText());
  }

  await browser.close();
})();
