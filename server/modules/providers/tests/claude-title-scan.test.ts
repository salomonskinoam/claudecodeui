import assert from 'node:assert/strict';
import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { ClaudeSessionSynchronizer } from '../list/claude/claude-session-synchronizer.provider.js';

// The title scan reads only what a transcript gained since the last sync, and still finds the last title.
test('the title scan reads new lines only, keeps the last title, and starts over when the file shrinks', async () => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'title-')), 't.jsonl');
  const scan = (s: ClaudeSessionSynchronizer) => (s as unknown as { extractCustomTitle: (f: string) => Promise<string | undefined> }).extractCustomTitle(file);
  const sync = new ClaudeSessionSynchronizer();
  const line = (o: object) => `${JSON.stringify(o)}\n`;

  await writeFile(file, line({ type: 'user', message: 'about "type":"custom-title" in text' }) + line({ type: 'ai-title', aiTitle: 'first' }));
  assert.equal(await scan(sync), 'first');
  await appendFile(file, line({ type: 'custom-title', customTitle: 'renamed' }) + line({ type: 'ai-title', aiTitle: 'later' }));
  assert.equal(await scan(sync), 'renamed');
  await appendFile(file, `${'x'.repeat(3 << 20)}\n` + line({ type: 'custom-title', customTitle: 'again' }).slice(0, -1));
  assert.equal(await scan(sync), 'renamed'); // the last line is not finished yet
  await appendFile(file, '\n');
  assert.equal(await scan(sync), 'again');
  await writeFile(file, line({ type: 'ai-title', aiTitle: 'short' }));
  assert.equal(await scan(sync), 'short');
});
