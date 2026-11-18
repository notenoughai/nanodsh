import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES = [join(ROOT, 'index.js'), ...readdirSync(join(ROOT, 'lib')).map((name) => join(ROOT, 'lib', name))];

const FORBIDDEN = [
  [/process\.exit\b/, 'process.exit'],
  [/process\.exitCode/, 'process.exitCode'],
  [/process\.stdout\.write/, 'process.stdout.write'],
  [/process\.stderr\.write/, 'process.stderr.write'],
  [/process\.on\(/, 'process.on'],
  [/console\./, 'console'],
];

test('core prints nothing and ends no process', () => {
  const offenders = [];
  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf8');
    for (const [pattern, name] of FORBIDDEN) {
      if (pattern.test(source)) offenders.push(`${file.slice(ROOT.length)}: ${name}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('core carries no command line dependency', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies.commander, undefined);
});