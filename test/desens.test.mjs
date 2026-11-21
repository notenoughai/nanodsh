import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRules, parsePrePush, scanText } from '../scripts/desens.mjs';

const rules = loadRules();
const fabricatedToken = ['ghp', 'x'.repeat(36)].join('_');
const fabricatedAddress = ['10', '1', '2', '3'].join('.');
const fabricatedHost = ['private', 'alpha', 'host'].join('-');

test('a token is reported by rule name and location only', () => {
  const findings = scanText(`const key = "${fabricatedToken}";\n`, 'lib/example.js', rules);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'token-prefix');
  assert.equal(findings[0].path, 'lib/example.js');
  assert.equal(findings[0].line, 1);
  assert.ok(!JSON.stringify(findings).includes(fabricatedToken));
});

test('documentation addresses and loopback are allowed', () => {
  const findings = scanText('hosts: 127.0.0.1, 203.0.113.9, example.test\n', 'README.md', rules);
  assert.deepEqual(findings, []);
});

test('a private network address is reported', () => {
  const findings = scanText(`url: http://${fabricatedAddress}/admin\n`, 'lib/example.js', rules);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'internal-range');
});

test('a private rule from an external file is reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dens-rules-'));
  try {
    const file = join(dir, 'desens.txt');
    writeFileSync(file, 'private-[a-z]+-host\n');
    const external = loadRules(file);
    const findings = scanText(`connect ${fabricatedHost}\n`, 'lib/example.js', external);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'private');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a ruleset override variable makes the command refuse', () => {
  assert.throws(() => {
    execFileSync(process.execPath, ['scripts/desens.mjs', '--staged'], {
      env: { ...process.env, GITLEAKS_CONFIG: '/tmp/whatever.toml' },
      stdio: 'pipe',
    });
  }, /GITLEAKS_CONFIG/);
});

test('pre-push refs are read from the four fields git sends', () => {
  const zero = '0'.repeat(40);
  const first = 'a'.repeat(40);
  const second = 'b'.repeat(40);
  const base = 'c'.repeat(40);
  const text = [
    `refs/heads/main ${first} refs/heads/main ${zero}`,
    `refs/heads/topic ${second} refs/heads/topic ${base}`,
    `refs/heads/gone ${zero} refs/heads/gone ${base}`,
    '',
  ].join('\n');
  assert.deepEqual(parsePrePush(text), [
    [first, '--not', '--remotes'],
    [`${base}..${second}`],
  ]);
});
