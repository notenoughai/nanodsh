import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBootNodeVersion, boot } from '@nanodsh/core';

test('booting is refused below Node.js 22.15', () => {
  for (const version of ['20.20.2', '22.0.0', '22.8.0', '22.11.9', 'v22.11.0', '22.12.0', '22.14.9']) {
    assert.throws(
      () => assertBootNodeVersion(version),
      new RegExp(`nanodsh: booting a profile needs Node\\.js >= 22\\.15\\.0; this is ${version.replaceAll('.', '\\.')}`),
      version,
    );
  }
});

test('booting is allowed from Node.js 22.15', () => {
  for (const version of ['22.15.0', '22.15.1', '22.23.5', '24.22.3', '26.0.0']) {
    assert.doesNotThrow(() => assertBootNodeVersion(version), version);
  }
});

test('an unparsable version is not blocked', () => {
  assert.doesNotThrow(() => assertBootNodeVersion('unknown'));
});

test('boot refuses the version it is given before it reads a home', async () => {
  await assert.rejects(
    boot({ home: '/nonexistent-nanodsh-home', profile: 'x', nodeVersion: '20.20.2' }),
    /booting a profile needs Node\.js >= 22\.15\.0; this is 20\.20\.2/,
  );
});
