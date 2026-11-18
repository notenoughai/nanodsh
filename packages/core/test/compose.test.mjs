import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { composeConfig, createProfile } from '@nanodsh/core';

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-compose-'));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test('a composed tree comes back as text, not as output', () => {
  const box = sandbox();
  try {
    const profile = createProfile({ home: box.home, name: 'quiet', bundles: [] });
    const composed = composeConfig({ home: box.home, profile: profile.name });
    assert.equal(typeof composed.text, 'string');
    assert.equal(Array.isArray(composed.notices), true);
  } finally {
    box.cleanup();
  }
});

test('a profile that composes no entries still composes', () => {
  const box = sandbox();
  try {
    const profile = createProfile({ home: box.home, name: 'empty', bundles: [] });
    const composed = composeConfig({ home: box.home, profile: profile.name });
    assert.equal(composed.text.trim().length, 0);
    assert.deepEqual(composed.notices, []);
  } finally {
    box.cleanup();
  }
});