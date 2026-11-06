import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createFileTreeService } from '@/modules/file-tree/file-tree.service.js';
import type { FileTreeServiceDependencies } from '@/shared/types.js';

/**
 * quests: the flat file list behind "@" lists every file past the tree's 10,000-entry cap, keeps hidden files,
 * and leaves out what .gitignore names, .git and node_modules.
 */
test('listProjectFilePaths lists every file with its relative path, past 10,000 files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'file-list-'));
  try {
    await mkdir(path.join(root, 'many'));
    await Promise.all(Array.from({ length: 10_050 }, (_, i) => writeFile(path.join(root, 'many', `f${i}.txt`), '')));
    await mkdir(path.join(root, '.claude', 'skills'), { recursive: true });
    await writeFile(path.join(root, '.claude', 'skills', 'SKILL.md'), '');
    await mkdir(path.join(root, 'build'));
    await writeFile(path.join(root, 'build', 'out.js'), '');
    await mkdir(path.join(root, 'node_modules', 'x'), { recursive: true });
    await writeFile(path.join(root, 'node_modules', 'x', 'index.js'), '');
    await mkdir(path.join(root, '.git'));
    await writeFile(path.join(root, '.git', 'HEAD'), '');
    await writeFile(path.join(root, '.gitignore'), 'build/\n');
    const service = createFileTreeService({
      projects: { getProjectPathById: async () => root },
    } as unknown as FileTreeServiceDependencies);

    const list = await service.listProjectFilePaths('p');
    const relative = new Set(list.paths);

    assert.equal(list.root, root);
    assert.equal(list.paths.length, 10_052); // the 10,050, the skill, .gitignore
    assert.ok(relative.has(path.join('.claude', 'skills', 'SKILL.md')));
    assert.ok(relative.has('.gitignore'));
    assert.equal(list.paths.some((p) => p.startsWith('build') || p.startsWith('node_modules') || p.startsWith('.git/')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
