import assert from 'node:assert/strict';

import { test } from 'vitest';

import { formatClosingLines } from '@/modules/chat/utils/closingLines';

test('quests: the closing block becomes one paragraph per item, each head in bold', () => {
  const text = 'The same fix covers them.\nRunning: nothing\nRequired from you: your go on the fix.\nquestion: may I shuffle the test rows once?';
  assert.equal(
    formatClosingLines(text),
    'The same fix covers them.\n\n**Running:** nothing\n\n**Required from you:** your go on the fix.\n\n**question:** may I shuffle the test rows once?',
  );
});

test('quests: a head already in bold stays single bold; a list under Running keeps its lines; text without the block is untouched', () => {
  assert.equal(formatClosingLines('**Running:** x\nwaiting for the runs'), '**Running:** x\n\n**waiting for** the runs');
  assert.equal(
    formatClosingLines('Running:\n- 2 probes;\n- 2 runs.\nRequired from you: nothing.\nDone the catalogue.'),
    '**Running:**\n- 2 probes;\n- 2 runs.\n\n**Required from you:** nothing.\n\n**Done** the catalogue.',
  );
  assert.equal(formatClosingLines('just prose\nmore prose'), 'just prose\nmore prose');
});
