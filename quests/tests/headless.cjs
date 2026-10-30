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
if (!['live', 'pin', 'bottom', 'scroll', 'tabs', 'mode', 'plan', 'queue', 'drag', 'next', 'latch', 'readonly', 'forest', 'ticketchat', 'tabhover', 'newtab', 'synccursor', 'dropline', 'split', 'colors', 'groups', 'dragtop', 'focus', 'subagents', 'livescroll', 'planwait', 'typejump', 'join', 'worktab'].includes(check) || !sessionId) {
  console.error('usage: node quests/tests/headless.cjs live|pin|bottom|scroll|tabs|mode|plan|queue|drag|next|latch|readonly|forest|ticketchat|tabhover|newtab|synccursor|dropline|split|colors|groups <sessionId>');
  process.exit(2);
}
const secret = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true })
  .prepare("select value from app_config where key like '%jwt%'").get().value;
const token = jwt.sign({ userId: 1, username: os.userInfo().username }, secret, { expiresIn: 600 });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/google/chrome/chrome', headless: true, args: ['--disable-smooth-scrolling'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript((t) => localStorage.setItem('auth-token', t), token);
  // The list's default (focus) shows only the chats that wait for the user; every check but `focus` reads the
  // whole list, so they open the page in archive mode.
  await page.addInitScript((mode) => localStorage.setItem('quests-queue-mode', mode), check === 'focus' ? 'focus' : 'archive');
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
    const rows = page.locator('[data-quests-tabs="row"]');
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
      tabs: Array.from(document.querySelectorAll('[data-quests-tabs="row"] > [draggable="true"]')).map((t) => t.textContent.replace('×', '').trim().slice(0, 30)),
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
    // Aim at the top edge of the line after `next` (or, when `next` is the last line, at its lower half): the root
    // lands right after `next`, below its own side quest.
    const afterNext = before.view[before.view.indexOf(side.key) + 2];
    await mouseDrag(root, page.locator(`[data-queue-key="${afterNext ?? next}"]`), afterNext ? 3 : 22);
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

  const putLatch = (key) => page.evaluate(async (k) => fetch('/api/quests/queue/latch', {
    method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('auth-token')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: k }),
  }), key);

  if (check === 'next') {
    // Alt+Enter with an empty input box brings the next entry that needs the user (nothing is sent).
    const q = await apiQueue();
    const current = q.entries.find((e) => e.sessionId === sessionId)?.key;
    const expected = q.view.find((k) => k !== current && q.entries.find((e) => e.key === k).waitsForMe);
    await page.locator('[data-slot="prompt-input-textarea"]').first().focus();
    await page.keyboard.press('Alt+Enter');
    await page.waitForTimeout(2500);
    const e = q.entries.find((x) => x.key === expected);
    // A chat opens; an unclaimed ticket opens a new chat with the ticket text typed in (cleared again here).
    const box = page.locator('[data-slot="prompt-input-textarea"]').first();
    const opened = e.sessionId ? await page.evaluate((id) => location.pathname === `/session/${id}`, e.sessionId)
      : (await box.inputValue()) === `we are starting this ticket ${e.url}`;
    console.log(JSON.stringify({ expected, url: await page.evaluate(() => location.pathname), opened }));
    if (!e.sessionId) { await box.fill(''); await page.waitForTimeout(1500); }
  }

  if (check === 'latch') {
    // The pin is manual only. Click the pin on the chat's line: it is first in the list, above everything, and its
    // line shows the pin. Click the pin again: unpinned. The user's own pin, if any, is put back at the end.
    const q = await apiQueue();
    const mine = q.entries.find((e) => e.sessionId === sessionId);
    const line = page.locator(`[data-quests-queue="list"] [data-queue-key="${mine.key}"]`);
    await line.hover();
    await line.locator('[data-quests-pin]').click();
    await page.waitForTimeout(2500);
    const after = await apiQueue();
    const onTop = after.view[0] === mine.key;
    const pinnedIcons = await page.locator('[data-quests-queue="list"] [data-quests-pin="pinned"]').count();
    const pinnedLine = await page.locator('[data-quests-queue="list"] [data-queue-key]').first().getAttribute('data-queue-key');
    console.log(JSON.stringify({ pinned: mine.key, latch: after.latch, onTop, pinnedIcons, pinnedLine }));
    await page.locator('[data-quests-queue="list"] [data-quests-pin="pinned"]').click();
    await page.waitForTimeout(2500);
    console.log(JSON.stringify({ unpinnedByClick: (await apiQueue()).latch === null, usersPinPutBack: q.latch }));
    await putLatch(q.latch);
  }

  if (check === 'readonly') {
    console.log(JSON.stringify({
      banner: await page.locator('[data-quests-queue="outside"]').isVisible(),
      inputBox: await page.locator('[data-slot="prompt-input-textarea"]').count(),
    }));
  }

  if (check === 'forest') {
    const q = await apiQueue();
    const root = q.entries.find((e) => e.rootKey === e.key && q.entries.some((c) => c.parentKey === e.key && c.rootKey === e.key));
    const kids = q.entries.filter((c) => c.parentKey === root.key && c.rootKey === root.key).map((c) => c.key);
    const roots = await page.evaluate(() => Array.from(document.querySelectorAll('[data-quests-queue="forest"] > div > div > [data-forest-key]')).map((n) => n.dataset.forestKey));
    await page.locator(`[data-forest-key="${root.key}"]`).hover();
    const lineLit = await page.locator(`[data-quests-queue="list"] [data-queue-key="${root.key}"]`).evaluate((n) => n.className.includes('brightness-150'));
    await page.locator(`[data-quests-queue="list"] [data-queue-key="${kids[0]}"]`).hover();
    const nodeLit = await page.locator(`[data-forest-key="${kids[0]}"]`).evaluate((n) => n.className.includes('brightness-150'));
    await page.locator(`[data-forest-key="${root.key}"] button`).click();
    const folded = await page.locator(`[data-forest-key="${kids[0]}"]`).count() === 0;
    const target = q.entries.find((e) => e.sessionId && e.sessionId !== sessionId);
    await page.locator(`[data-forest-key="${target.key}"]`).click();
    await page.waitForTimeout(2000);
    console.log(JSON.stringify({
      rootsSideBySide: roots.length === q.entries.filter((e) => e.rootKey === e.key).length, root: root.key, kids, lineLit, nodeLit, folded,
      clickOpened: await page.evaluate((id) => location.pathname === `/session/${id}`, target.sessionId),
    }));
  }

  if (check === 'ticketchat') {
    // Click an unclaimed ticket: a new chat opens with the ticket text typed in, unsent (it names itself at its start).
    // The text is then cleared, so no draft is left behind. Nothing is sent.
    const q = await apiQueue();
    const t = q.entries.find((e) => e.state === 'unclaimed');
    await page.locator(`[data-quests-queue="list"] [data-queue-key="${t.key}"]`).click();
    await page.waitForTimeout(3000);
    const box = page.locator('[data-slot="prompt-input-textarea"]').first();
    const text = await box.inputValue();
    console.log(JSON.stringify({ ticket: t.key, url: await page.evaluate(() => location.pathname), text, ok: text === `we are starting this ticket ${t.url}` }));
    await box.fill('');
    await page.waitForTimeout(1500);
  }

  if (check === 'tabhover') {
    // Hovering the chat's tab lights up its line in the list and its node in the forest. The tab wears the same
    // family color as its line, and the same kind sign.
    const key = (await apiQueue()).entries.find((e) => e.sessionId === sessionId).key;
    const tab = page.locator('[data-quests-tabs="row"] > [draggable="true"]').first();
    const line = page.locator(`[data-quests-queue="list"] [data-queue-key="${key}"]`);
    const node = page.locator(`[data-forest-key="${key}"]`);
    const lit = async () => ({
      tab: await tab.evaluate((n) => n.className.includes('brightness-150')),
      line: await line.evaluate((n) => n.className.includes('brightness-150')),
      node: await node.evaluate((n) => n.className.includes('brightness-150')),
    });
    await tab.hover();
    await page.waitForTimeout(300);
    const fromTab = await lit();
    await page.mouse.move(0, 0);
    await line.hover();
    await page.waitForTimeout(300);
    const fromLine = await lit();
    await page.mouse.move(0, 0);
    await node.hover();
    await page.waitForTimeout(300);
    const fromNode = await lit();
    console.log(JSON.stringify({
      key,
      fromTab, fromLine, fromNode,
      sameColor: (await tab.evaluate((n) => n.style.backgroundColor)) === (await line.evaluate((n) => n.style.backgroundColor)),
      sign: { tab: await tab.locator('[title="Quest"], [title="Side quest"], [title="Blocker"]').count(), line: await line.locator('[title="Quest"], [title="Side quest"], [title="Blocker"]').count() },
    }));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  }

  if (check === 'groups') {
    // The list has three groups with a separator between them: open chats, chats closed without /finalize-chat,
    // unclaimed tickets. The groups come from the server; a separator sits exactly where the group changes.
    const q = await apiQueue();
    const group = new Map(q.entries.map((e) => [e.key, e.group]));
    const rows = await page.locator('[data-quests-queue="list"] [data-queue-key]').evaluateAll((ns) => ns.map((n) => [n.dataset.queueKey, n.className.includes('before:h-[2px]')]));
    const expected = rows.map(([k], i) => i > 0 && group.get(rows[i - 1][0]) !== group.get(k));
    console.log(JSON.stringify({
      separators: rows.filter(([, s]) => s).map(([k]) => k),
      asExpected: rows.every(([, s], i) => s === expected[i]),
      groups: [0, 1, 2].map((g) => rows.filter(([k]) => group.get(k) === g).length),
    }));
  }

  if (check === 'planwait') {
    // A chat whose plan waits for approval shows the approval card above the input box, with "Revise" and
    // "Build the plan". Nothing is clicked.
    await page.locator('[data-quests-plan="approval"]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    const card = page.locator('[data-quests-plan="approval"]');
    console.log(JSON.stringify({
      cards: await card.count(),
      text: (await card.first().textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160),
      buttons: await card.locator('button').allTextContents().catch(() => []),
    }));
  }

  if (check === 'livescroll') {
    // Reading older messages while the transcript changes on disk: the reading position must not move. The pane
    // is scrolled to the middle, a row in view is marked, the transcript's mtime is touched (the watcher reloads
    // the chat), and the marked row's place is measured again 4 s later.
    const jsonl = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true })
      .prepare('select jsonl_path from sessions where session_id = ?').get(sessionId)?.jsonl_path;
    await page.locator('.chat-messages-pane .chat-message').first().waitFor({ timeout: 40000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    await pane.evaluate((p) => { p.scrollTop = Math.round(p.scrollHeight * 0.5); });
    await page.waitForTimeout(2500);
    const measure = () => pane.evaluate((p) => {
      const top = p.getBoundingClientRect().top;
      let marker = p.querySelector('[data-quests-marker]');
      if (!marker) {
        marker = Array.from(p.querySelectorAll('.chat-message')).find((m) => m.getBoundingClientRect().top >= top);
        marker?.setAttribute('data-quests-marker', '');
      }
      return { scrollTop: p.scrollTop, markerTop: marker ? Math.round(marker.getBoundingClientRect().top - top) : null, markerStillThere: Boolean(marker), rows: p.querySelectorAll('.chat-message').length, height: p.scrollHeight };
    });
    const before = await measure();
    const now = new Date();
    require('node:fs').utimesSync(jsonl, now, now);
    // Then 30 s of watching, every 3 s: on a running chat, rows land meanwhile.
    const samples = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000);
      const m = await measure();
      samples.push({ rows: m.rows, height: m.height, scrollTop: m.scrollTop, markerTop: m.markerTop });
    }
    const jumped = samples.some((s) => s.markerTop !== before.markerTop);
    const rowsLanded = samples[samples.length - 1].rows - before.rows;
    console.log(JSON.stringify({ jsonl: path.basename(jsonl), before, samples, rowsLanded, jumped }));
  }

  if (check === 'typejump') {
    // At the bottom of a long chat, typing one character into the input box must not move the view. The pane is
    // scrolled to its end, the last row in view is marked, one character is typed, and the row's place and the
    // pane's scrollTop are measured again; the character is then deleted.
    await page.locator('.chat-messages-pane .chat-message').first().waitFor({ timeout: 40000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
    await pane.evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await page.waitForTimeout(1500);
    const measure = () => pane.evaluate((p) => {
      const top = p.getBoundingClientRect().top;
      let marker = p.querySelector('[data-quests-marker]');
      if (!marker) {
        marker = Array.from(p.querySelectorAll('.chat-message')).reverse().find((m) => m.getBoundingClientRect().top >= top);
        marker?.setAttribute('data-quests-marker', '');
      }
      return { scrollTop: p.scrollTop, clientHeight: p.clientHeight, height: p.scrollHeight, markerTop: marker ? Math.round(marker.getBoundingClientRect().top - top) : null, downArrow: Boolean(document.querySelector('[aria-label="Scroll to bottom"]')) };
    });
    // As Noam had it: a draft of several lines already in the box, the view at the end, then one more character.
    const box = page.locator('[data-slot="prompt-input-textarea"]').first();
    await box.fill('46.2 yes. and all false positive rulings that repeat.\ndoes that mean some classifications change?\n\n\nwe dont want to DO any fixes in this chat.\nInstead, I want a ticket per task and i will fix each one in its own chat.\n');
    await page.waitForTimeout(800);
    await pane.evaluate((p) => { p.scrollTop = p.scrollHeight; });
    await page.waitForTimeout(1200);
    const before = await measure();
    await box.focus();
    await page.keyboard.press('End');
    await page.keyboard.type('s');
    await page.waitForTimeout(1200);
    const after = await measure();
    await box.fill('');
    await page.waitForTimeout(500);
    const cleared = await measure();
    console.log(JSON.stringify({ before, after, cleared, jumped: after.markerTop !== before.markerTop }));
  }

  if (check === 'join') {
    // A message sent while the chat works joins the running turn: the process (pid) stays, the running Bash
    // finishes, both replies land. Starts a throwaway chat from the "+" tab; <sessionId> is only the page to start on.
    const fs = require('node:fs');
    const reg = () => fs.readdirSync(path.join(os.homedir(), '.claude', 'sessions')).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'sessions', f), 'utf8')); } catch { return null; }
    }).filter((d) => d && d.entrypoint === 'sdk-ts').map((d) => `${String(d.sessionId).slice(0, 8)}:${d.pid}:${d.status}`).sort().join(' ');
    const texts = () => page.locator('[data-message-timestamp]').evaluateAll((rows) => rows.slice(-6).map((r) => r.textContent.replace(/\s+/g, ' ').slice(0, 90)));
    await page.locator('[data-quests-tab="new"]').first().click();
    await page.waitForTimeout(2500);
    const box = page.locator('[data-slot="prompt-input-textarea"]').first();
    const t0 = Date.now();
    await box.fill('Use Bash to run exactly: sleep 45; echo finished. Then reply with exactly: first done');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(12000);
    const during = { at: Date.now() - t0, reg: reg(), url: await page.evaluate(() => location.pathname) };
    await box.fill('Reply with exactly: second done');
    await page.keyboard.press('Enter');
    const samples = [];
    for (let i = 0; i < 30; i += 1) {
      await page.waitForTimeout(3000);
      samples.push({ at: Date.now() - t0, reg: reg(), last: (await texts()).slice(-2) });
      const all = (await texts()).join(' | ');
      if (all.includes('first done') && all.includes('second done')) break;
    }
    console.log(JSON.stringify({ during, samples, rows: await texts() }, null, 1));
  }

  if (check === 'worktab') {
    // The last agent call's "open as a tab" icon: a work tab opens right after the chat's tab, the address is
    // /work/agent/<session>/<agent>, and the tab shows the agent view (its timeline once the server answers).
    const icon = page.locator('[data-quests-work="open-agent"]').last();
    await icon.waitFor({ timeout: 20000 }).catch(() => undefined);
    const counts = { agentIcons: await page.locator('[data-quests-work="open-agent"]').count(), stripIcons: await page.locator('[data-quests-work^="open-"]').count(), chips: await page.locator('[data-quests-work-chip]').count(), rows: await page.locator('[data-message-timestamp]').count() };
    console.log(JSON.stringify(counts));
    if (!counts.agentIcons) { await browser.close(); return; }
    // The agent's row usually sits inside a folded tool group (kept mounted, hidden), where a DOM click is not
    // delivered; the check calls the row's React handler, as a click on the unfolded row would.
    await icon.evaluate((n) => {
      const key = Object.keys(n).find((k) => k.startsWith('__reactProps'));
      n[key].onClick({ preventDefault() {}, stopPropagation() {} });
    });
    await page.waitForTimeout(4000);
    const tabs = await page.locator('[data-quests-tabs="row"] [title]').evaluateAll((ns) => ns.map((n) => (n.getAttribute('title') || '').slice(0, 40)));
    console.log(JSON.stringify({
      url: await page.evaluate(() => location.pathname),
      view: await page.locator('[data-quests-work]').first().getAttribute('data-quests-work').catch(() => null),
      text: (await page.locator('[data-quests-work="agent"]').textContent().catch(() => '')).slice(0, 160),
      tabs,
      titles: await page.evaluate(() => localStorage.getItem('quests-work-titles')),
      panes: await page.evaluate(() => localStorage.getItem('quests-panes')),
    }));
  }

  if (check === 'subagents') {
    // The agents' live summary under their calls: each panel's step and figures (tokens, tools, time), read twice
    // 4 s apart: a running agent's time ticks and its figures follow the agent's transcript.
    const read = () => page.locator('[data-quests-subagent="figures"]').evaluateAll((ns) => ns.map((n) => ({
      step: n.parentElement.querySelector('[data-quests-subagent="step"]')?.textContent ?? '',
      figures: n.textContent.trim(),
    })));
    await page.locator('[data-quests-subagent="figures"]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    const first = await read();
    await page.waitForTimeout(4000);
    const second = await read();
    console.log(JSON.stringify({ panels: first.length, first: first.slice(-4), second: second.slice(-4) }));
  }

  if (check === 'focus') {
    // The default list: the chats that wait for the user plus the chat on screen, then "Live chats (n)" and
    // "Tickets-Unclaimed (n)" collapsed; a click opens a group; Archive shows everything; the DONE button sits
    // in the composer and is disabled while something is typed; the trash opens its popup; Cancel closes it.
    const q = await apiQueue();
    const view = q.view.map((k) => q.entries.find((e) => e.key === k));
    const mine = q.entries.find((e) => e.sessionId === sessionId)?.key;
    const expected = view.filter((e) => e.waitsForMe || e.key === mine).map((e) => e.key);
    const keys = () => page.locator('[data-quests-queue="list"] [data-queue-key]').evaluateAll((ns) => ns.map((n) => n.dataset.queueKey));
    const shown = await keys();
    const groupText = (label) => page.locator(`[data-quests-group="${label}"]`).textContent();
    const live = await groupText('Live chats');
    const unclaimed = await groupText('Tickets-Unclaimed');
    await page.locator('[data-quests-group="Tickets-Unclaimed"]').click();
    await page.waitForTimeout(300);
    const opened = (await keys()).length;
    await page.locator('[data-quests-group="Tickets-Unclaimed"]').click();
    const done = page.locator('[data-quests-done="button"]');
    const doneEnabled = await done.isEnabled();
    const box = page.locator('[data-slot="prompt-input-textarea"]').first();
    await box.fill('x');
    await page.waitForTimeout(300);
    const doneWhileTyped = await done.isEnabled();
    await box.fill('');
    await page.waitForTimeout(300);
    await page.locator(`[data-queue-key="${shown[0]}"]`).hover();
    await page.locator(`[data-queue-key="${shown[0]}"] [data-quests-line="dismiss"]`).click();
    await page.waitForTimeout(400);
    const popup = await page.locator('[data-quests-queue="dismiss"]').isVisible();
    await page.locator('[data-quests-queue="dismiss"] button', { hasText: 'Cancel' }).click();
    await page.waitForTimeout(300);
    await page.locator('[data-quests-queue="archive"]').click();
    await page.waitForTimeout(500);
    const archiveLines = (await keys()).length;
    await page.locator('[data-quests-queue="archive"]').click();
    console.log(JSON.stringify({
      linesAsExpected: JSON.stringify(shown) === JSON.stringify(expected), lines: shown.length, live, unclaimed,
      openedUnclaimed: opened - shown.length, expectedUnclaimed: view.filter((e) => e.state === 'unclaimed').length,
      doneEnabled, doneWhileTyped, dismissPopup: popup, archiveLines, viewLines: view.length,
    }));
  }

  if (check === 'dragtop') {
    // Drag the last line of the first group, then the first line of the second group, onto the upper half of the
    // top line: where each lands in the view, and in the stored order. The order is put back after.
    const before = await apiQueue();
    const keysNow = () => page.locator('[data-quests-queue="list"] [data-queue-key]').evaluateAll((ns) => ns.map((n) => n.dataset.queueKey));
    const groupOf = (k) => before.entries.find((e) => e.key === k)?.group;
    const shown = await keysNow();
    const roots = shown.filter((k) => { const e = before.entries.find((e) => e.key === k); return e.rootKey === k && e.state !== 'permission'; });
    const picks = [[...roots].reverse().find((k) => groupOf(k) === 0), roots.find((k) => groupOf(k) === 1)].filter(Boolean);
    const results = [];
    for (const key of picks) {
      const from = await page.locator(`[data-queue-key="${key}"]`).boundingBox();
      const top = await page.locator(`[data-queue-key="${shown[0]}"]`).boundingBox();
      await page.mouse.move(from.x + 40, from.y + from.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(top.x + 40, from.y + (top.y + 3 - from.y) * (i / 10));
      await page.waitForTimeout(200);
      await page.mouse.up();
      await page.waitForTimeout(2000);
      const after = await apiQueue();
      results.push({ key, group: groupOf(key), viewIndexBefore: shown.indexOf(key), viewIndexAfter: (await keysNow()).indexOf(key), orderIndexAfter: after.order.indexOf(key), latch: after.latch });
      await page.evaluate(async (order) => fetch('/api/quests/queue/order', {
        method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('auth-token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }), before.order);
      await page.waitForTimeout(2000);
    }
    console.log(JSON.stringify({ top: shown[0], results }));
  }

  if (check === 'dropline') {
    // Dragging a line keeps the list still and shows one blue landing line; released outside the list, nothing moves.
    const before = await apiQueue();
    const keysNow = () => page.locator('[data-quests-queue="list"] [data-queue-key]').evaluateAll((ns) => ns.map((n) => n.dataset.queueKey));
    const shown = await keysNow();
    const root = shown.find((k) => before.entries.find((e) => e.key === k).rootKey === k && before.entries.find((e) => e.key === k).state !== 'permission' && k !== before.latch);
    const from = await page.locator(`[data-queue-key="${root}"]`).boundingBox();
    const to = await page.locator(`[data-queue-key="${shown[shown.indexOf(root) + 3]}"]`).boundingBox();
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    const samples = [];
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(to.x + 40, from.y + (to.y + to.height * 0.75 - from.y) * (i / 10));
      await page.waitForTimeout(150);
      samples.push({ same: JSON.stringify(await keysNow()) === JSON.stringify(shown), markers: await page.locator('[data-quests-queue="list"] .bg-\\[\\#3794ff\\]').count() });
    }
    await page.mouse.move(to.x + 40, to.y + 2000);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    console.log(JSON.stringify({ root, samples, orderUnchanged: JSON.stringify((await apiQueue()).order) === JSON.stringify(before.order) }));
    // A real drop on the lower half of that line: the root lands right below it. Then the order is put back.
    const onto = shown[shown.indexOf(root) + 3];
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(to.x + 40, from.y + (to.y + to.height * 0.75 - from.y) * (i / 10));
    await page.mouse.up();
    await page.waitForTimeout(2000);
    const landed = await keysNow();
    await page.evaluate(async (order) => fetch('/api/quests/queue/order', {
      method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('auth-token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }), before.order);
    console.log(JSON.stringify({ onto, landedRightBelow: landed.indexOf(root) === landed.indexOf(onto) + 1,
      restored: JSON.stringify((await apiQueue()).order) === JSON.stringify(before.order) }));
  }

  if (check === 'split') {
    // A tab dropped on the right half of the chat opens in the right pane; dropped on the left half, it is shown on
    // the left and the chat that was there moves to the right pane. Uses this headless browser's own tabs only.
    const other = (await apiQueue()).entries.find((e) => e.sessionId && e.sessionId !== sessionId).sessionId;
    await page.goto(`http://127.0.0.1:3001/session/${other}`);
    await page.waitForTimeout(4000);
    const panes = () => page.evaluate(() => JSON.parse(localStorage.getItem('quests-panes') || '{}'));
    const dragTabTo = async (id, xShare) => {
      const tabs = await page.locator('[data-quests-tabs="row"] > [draggable="true"]').evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().toJSON()));
      const p = await panes();
      const all = [...p.left, ...p.right];
      const box = tabs[all.indexOf(id)];
      const area = await page.locator('.chat-messages-pane').first().boundingBox();
      await page.mouse.move(box.x + 20, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + (area.x + area.width * xShare - box.x - 20) * (i / 10), box.y + (area.y + area.height / 2 - box.y) * (i / 10));
      await page.mouse.up();
      await page.waitForTimeout(2500);
    };
    const start = await panes();
    await dragTabTo(sessionId, 0.8);
    const right = { panes: await panes(), url: await page.evaluate(() => location.pathname) };
    await dragTabTo(sessionId, 0.2);
    const left = { panes: await panes(), url: await page.evaluate(() => location.pathname) };
    console.log(JSON.stringify({ sessionId, other, start, right, left, latch: (await apiQueue()).latch }, null, 1));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  }

  if (check === 'colors') {
    // Static: every family keeps its color after the first line moves to the bottom and after a reload (the order
    // is put back). Distinct: families wear different colors while there are at most ten.
    const colorsNow = async () => Object.fromEntries((await listRows()).map((r) => [r.key, r.color]));
    const putOrder = (order) => page.evaluate(async (order) => fetch('/api/quests/queue/order', {
      method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('auth-token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }), order);
    const before = await colorsNow();
    const q = await apiQueue();
    const root = new Map(q.entries.map((e) => [e.key, e.rootKey]));
    const families = new Map(Object.entries(before).map(([k, c]) => [root.get(k), c]));
    const openFamilies = new Map(q.entries.filter((e) => e.group === 0).map((e) => [e.rootKey, families.get(e.rootKey)]));
    await putOrder([...q.order.filter((k) => k !== q.view[0]), q.view[0]]);
    await page.waitForTimeout(2500);
    const afterDrag = await colorsNow();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const afterReload = await colorsNow();
    await putOrder(q.order);
    const changed = (a) => Object.keys(before).filter((k) => a[k] !== before[k]);
    console.log(JSON.stringify({ lines: Object.keys(before).length, families: families.size, colors: new Set(families.values()).size,
      openFamilies: openFamilies.size, openColors: new Set(openFamilies.values()).size, changedByMove: changed(afterDrag), changedByReload: changed(afterReload) }));
  }

  if (check === 'synccursor') {
    // "Sync from Cursor" puts the chats open in Cursor on top of the list (it changes the real order, as asked) and
    // makes them the left pane's tabs, showing the first. Every line's name starts at the same x (no false indent).
    const lines = async () => page.locator('[data-quests-queue="list"] [data-queue-key]').evaluateAll((ns) => ns.slice(0, 9).map((n) => n.title));
    const state = async () => page.evaluate(() => ({ url: location.pathname, left: JSON.parse(localStorage.getItem('quests-panes') || '{}').left }));
    const before = { lines: await lines(), ...(await state()) };
    await page.locator('[data-quests-queue="sync-cursor"]').click();
    await page.waitForTimeout(3000);
    // The text of every line (a ticket's "#n", a chat's name) starts at the same x: no false indent.
    const textX = await page.locator('[data-quests-queue="list"] [data-queue-key]').evaluateAll((ns) => [...new Set(ns.map((n) =>
      Math.round((n.querySelector('a[title^="Ticket #"]') ?? n.querySelector('span.truncate')).getBoundingClientRect().left)))]);
    console.log(JSON.stringify({ before, after: { lines: await lines(), ...(await state()) }, textX, latch: (await apiQueue()).latch }, null, 1));
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  }

  if (check === 'newtab') {
    // The "+" tab opens a new empty chat; back on the chat, a double-click on the empty part of the tab row does too.
    const state = async () => page.evaluate(() => ({
      url: location.pathname,
      tabs: JSON.parse(localStorage.getItem('quests-panes') || '{}').left,
      input: Boolean(document.querySelector('[data-slot="prompt-input-textarea"]')),
    }));
    await page.locator('[data-quests-tab="new"]').first().click();
    await page.waitForTimeout(2000);
    const plus = await state();
    await page.goto(`http://127.0.0.1:3001/session/${sessionId}`);
    await page.waitForTimeout(4000);
    const row = await page.locator('[data-quests-tab="new"]').first().evaluate((b) => b.parentElement.getBoundingClientRect().toJSON());
    await page.mouse.dblclick(row.right - 30, row.top + row.height / 2);
    await page.waitForTimeout(2000);
    console.log(JSON.stringify({ plus, doubleClick: await state() }));
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
