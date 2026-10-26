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
//   plan    <sessionId> is a plan name here (~/.claude/plans/<name>.md): opens a chat tab, then the plan tab placed
//           right after it, and prints the left tab order, the URL and the start of the rendered plan
//   mode    the permission mode button: start mode, after Shift+Tab, after plain Tab (must not change)
//   queue   the session list: its lines must equal the queue's view from GET /api/quests/queue, one background
//           color per family, no CloudCLI logo in the header
//   drag    drags the first root line onto the last line (its family follows as the rules say), then drags another
//           and releases it outside the list (the order must not change); puts the first root back at the end
//   tabs    sets a layout (left: <sessionId> + the 2 next chats, right: 1 more), drags tabs between and within
//           panes, prints the stored layout after each drag. Restores no layout: use a fresh browser profile.
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const [check, sessionId] = process.argv.slice(2);
if (!['live', 'pin', 'bottom', 'scroll', 'tabs', 'mode', 'plan', 'queue', 'drag'].includes(check) || !sessionId) {
  console.error('usage: node quests/tests/headless.cjs live|pin|bottom|scroll|tabs|mode|plan|queue|drag <sessionId>');
  process.exit(2);
}
const secret = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true })
  .prepare("select value from app_config where key like '%jwt%'").get().value;
const token = jwt.sign({ userId: 1, username: os.userInfo().username }, secret, { expiresIn: 600 });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--disable-smooth-scrolling'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('auth-token', t), token);
  page.on('pageerror', (error) => console.log('page error:', (error.stack || error.message).slice(0, 700)));
  await page.goto(check === 'plan' ? 'http://127.0.0.1:3001/' : `http://127.0.0.1:3001/session/${sessionId}`);
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
    // Scrolls with the mouse wheel, as a user does: the 3-screens-ahead preload waits for the user's own
    // wheel, touch or keys, so setting scrollTop from code would not test it.
    await pane.evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await page.waitForTimeout(1500);
    const box = await pane.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const measure = () => pane.evaluate((p) => {
      const top = p.getBoundingClientRect().top;
      let marker = p.querySelector('[data-quests-marker]');
      if (!marker) {
        marker = Array.from(p.querySelectorAll('.chat-message')).find((m) => m.getBoundingClientRect().top >= top);
        marker?.setAttribute('data-quests-marker', '');
      }
      return { scrollTop: p.scrollTop, markerTop: marker ? marker.getBoundingClientRect().top : 0, count: p.querySelectorAll('.chat-message').length };
    });
    const out = { steps: 0, loads: 0, jumps: [] };
    while (out.steps < 150) {
      await pane.evaluate((p) => p.querySelector('[data-quests-marker]')?.removeAttribute('data-quests-marker'));
      const before = await measure();
      if (before.scrollTop <= 0) break;
      const want = Math.min(1500, before.scrollTop);
      await page.mouse.wheel(0, -1500);
      await page.waitForTimeout(80);
      const after = await measure();
      if (after.count !== before.count) out.loads++;
      if (Math.abs(after.markerTop - before.markerTop - want) > 2) out.jumps.push(Math.round(after.markerTop - before.markerTop - want));
      out.steps++;
    }
    console.log(JSON.stringify(out));
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

  if (check === 'plan') {
    const plan = sessionId;
    await page.waitForSelector('a[href^="/session/"]', { timeout: 20000 });
    const chats = (await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="/session/"]')).map((a) => a.getAttribute('href').slice(9)))).slice(0, 2);
    await page.evaluate(([a, b, p]) => {
      localStorage.setItem('quests-panes', JSON.stringify({ left: [a, b], right: [], rightActive: null }));
      // the same placement the page does when a chat writes a plan: right after the chat's tab
      const panes = JSON.parse(localStorage.getItem('quests-panes'));
      const at = panes.left.indexOf(a);
      panes.left.splice(at + 1, 0, `plan:${p}`);
      localStorage.setItem('quests-panes', JSON.stringify(panes));
    }, [chats[0], chats[1], plan]);
    await page.goto(`http://127.0.0.1:3001/plan/${plan}`);
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => ({
      tabs: Array.from(document.querySelectorAll('div.h-9 > [draggable="true"]')).map((t) => t.textContent.replace('×', '').trim().slice(0, 30)),
      url: location.pathname,
      rendered: document.querySelector('.prose h1, .prose h2')?.textContent?.slice(0, 80) ?? null,
    }));
    console.log(JSON.stringify(r));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  }

  const apiQueue = () => page.evaluate(async () => (await (await fetch('/api/quests/queue', {
    headers: { Authorization: `Bearer ${localStorage.getItem('auth-token')}` },
  })).json()).data);
  const listRows = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-quests-queue="list"] [data-queue-key]'))
    .map((r) => ({ key: r.dataset.queueKey, color: r.style.backgroundColor, draggable: r.draggable })));

  if (check === 'queue') {
    const q = await apiQueue();
    const rows = await listRows();
    const roots = new Set(q.entries.map((e) => e.rootKey));
    const colors = new Set(rows.map((r) => r.color));
    console.log(JSON.stringify({
      rowsMatchView: JSON.stringify(rows.map((r) => r.key)) === JSON.stringify(q.view),
      rows: rows.length, families: roots.size, colors: colors.size,
      headerLogo: await page.evaluate(() => /CloudCLI/.test(document.querySelector('.md\\:block')?.textContent ?? '')),
    }));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  }

  if (check === 'drag') {
    // A root with a side quest under it is dragged onto the line after that side quest: the side quest must come
    // along below it. Then another root is dragged and released outside the list: the order must not change.
    // The stored order is put back exactly at the end.
    const before = await apiQueue();
    const put = (route, body) => page.evaluate(async ([r, b]) => fetch(`/api/quests/queue${r}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('auth-token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    }), [route, body]);
    await page.evaluate(() => {
      window.__dragged = [];
      document.addEventListener('dragstart', (e) => window.__dragged.push(e.target.dataset?.queueKey), true);
    });
    const mouseDrag = async (fromKey, toLocator, y) => {
      const from = await page.locator(`[data-queue-key="${fromKey}"]`).boundingBox();
      const to = await toLocator.boundingBox();
      await page.mouse.move(from.x + 40, from.y + from.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(to.x + 40, from.y + (to.y + y - from.y) * (i / 8));
      await page.mouse.up();
      await page.waitForTimeout(2500);
    };
    const side = before.entries.find((e) => e.kind === 'sidequest' && e.parentKey && before.view.includes(e.parentKey));
    const root = side.parentKey;
    const next = before.view[before.view.indexOf(side.key) + 1];
    // Aim at the top edge of the line after `next`: the root lands right after `next`, below its own side quest.
    await mouseDrag(root, page.locator(`[data-queue-key="${before.view[before.view.indexOf(side.key) + 2]}"]`), 3);
    const after = await apiQueue();
    const at = (o, k) => o.indexOf(k);
    console.log(JSON.stringify({
      picked: await page.evaluate(() => window.__dragged), root, side: side.key, onto: next,
      before: [at(before.view, root), at(before.view, side.key), at(before.view, next)],
      after: [at(after.view, root), at(after.view, side.key), at(after.view, next)],
    }));
    const second = after.view.find((k) => k !== root && after.entries.find((e) => e.key === k).rootKey === k
      && after.entries.find((e) => e.key === k).state !== 'permission');
    await mouseDrag(second, page.locator('.chat-messages-pane'), 200);
    console.log(JSON.stringify({ releasedOutside: second, unchanged: JSON.stringify((await apiQueue()).order) === JSON.stringify(after.order) }));
    await put('/order', { order: before.order });
    console.log(JSON.stringify({ restored: JSON.stringify((await apiQueue()).order) === JSON.stringify(before.order) }));
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
