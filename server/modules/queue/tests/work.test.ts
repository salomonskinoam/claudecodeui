import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { findTaskOutputFile, isTaskOutputFile, readOutputTail } from '../work.js';

test('quests: only a file under a /tmp/claude-* folder is served', () => {
  assert.equal(isTaskOutputFile('/tmp/claude-1000/-home-noam-src-noam-worlds/0fbea6ac-4450-4870-a6ab-d42aa8c20c96/tasks/bwy06286r.output'), true);
  assert.equal(isTaskOutputFile('/tmp/claude-0fbea6ac/watch_all.log'), true);
  assert.equal(isTaskOutputFile('/tmp/claude-1000/-home-noam/../../etc/passwd'), false);
  assert.equal(isTaskOutputFile('/home/noam/.claude/plans/x.md'), false);
  assert.equal(isTaskOutputFile('/tmp/claude-1000/-home-noam/0fbea6ac-4450-4870-a6ab-d42aa8c20c96/tasks/x.output/../y.output'), false);
  assert.equal(isTaskOutputFile('/tmp/claude-x/..'), false);
});

test('quests: a task output file is found by session and task id under /tmp/claude-<uid>', async () => {
  const root = path.join(os.tmpdir(), `claude-${os.userInfo().uid}`);
  const sid = '00000000-0000-4000-8000-000000000001';
  const dir = path.join(root, '-quests-work-test', sid, 'tasks');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'b1.output'), 'x');
  assert.equal(findTaskOutputFile(sid, 'b1'), path.join(dir, 'b1.output'));
  assert.equal(findTaskOutputFile(sid, 'b2'), null);
  assert.equal(findTaskOutputFile('not-a-session', 'b1'), null);
  assert.equal(findTaskOutputFile(sid, '../b1'), null);
  await fsp.rm(path.join(root, '-quests-work-test'), { recursive: true });
});

test('quests: the tail of the output file, whole when small', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'quests-work-'));
  const file = path.join(dir, 'a.output');
  await fsp.writeFile(file, 'line one\nline two\n');
  const tail = await readOutputTail(file);
  assert.equal(tail.text, 'line one\nline two\n');
  assert.equal(tail.truncated, false);
  assert.equal(tail.size, 18);
  await fsp.rm(dir, { recursive: true });
});
