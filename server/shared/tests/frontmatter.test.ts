import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFrontMatter } from '../frontmatter.js';

test('a description with a colon is read as Claude Code reads it', () => {
  const parsed = parseFrontMatter('---\nname: finalize-chat\ndescription: Close a chat: commit and push. Use when "/finalize-chat".\nallowed-tools: Read, Bash\n---\n# Body\n');
  assert.equal(parsed.data.name, 'finalize-chat');
  assert.equal(parsed.data.description, 'Close a chat: commit and push. Use when "/finalize-chat".');
  assert.equal(parsed.content.trim(), '# Body');
});

test('plain yaml front matter still goes through the yaml engine', () => {
  const parsed = parseFrontMatter('---\nname: x\ntags: [a, b]\n---\n');
  assert.deepEqual(parsed.data.tags, ['a', 'b']);
});
