import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCompletion, SHELLS } from '../lib/completions.js';

for (const shell of SHELLS) {
  test(`the ${shell} script matches its golden file`, () => {
    const golden = readFileSync(new URL(`./golden/completion.${shell}`, import.meta.url), 'utf8');
    assert.equal(renderCompletion(shell), golden);
  });
}

test('the bash script parses', () => {
  execFileSync('bash', ['-n'], { input: renderCompletion('bash') });
});

test('an unknown shell is refused', () => {
  assert.throws(() => renderCompletion('tcsh'), /unknown shell/);
});
