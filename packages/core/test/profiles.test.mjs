import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createProfile, listProfiles, removeProfile } from '@nanodsh/core';

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-profiles-'));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test('a created profile lists with its bundles', () => {
  const box = sandbox();
  try {
    const created = createProfile({ home: box.home, name: 'work', bundles: [] });
    const listing = listProfiles({ home: box.home });
    assert.deepEqual(listing.profiles.map((entry) => entry.name), ['work']);
    assert.equal(created.dir, join(box.home, 'profiles', 'work'));
    assert.match(readFileSync(join(created.dir, 'package.json'), 'utf8'), /"name"/);
  } finally {
    box.cleanup();
  }
});

test('a shipped template name is created with a warning', () => {
  const box = sandbox();
  try {
    const created = createProfile({ home: box.home, name: 'web', bundles: [] });
    assert.equal(created.notices.some((line) => line.includes('shipped template')), true);
    assert.equal(listProfiles({ home: box.home }).profiles[0].shipped, true);
  } finally {
    box.cleanup();
  }
});

test('a subcommand name is created with a warning', () => {
  const box = sandbox();
  try {
    const created = createProfile({ home: box.home, name: 'plugin', bundles: [] });
    assert.equal(created.notices.some((line) => line.includes('subcommand')), true);
  } finally {
    box.cleanup();
  }
});

test('creating twice is refused', () => {
  const box = sandbox();
  try {
    createProfile({ home: box.home, name: 'work', bundles: [] });
    assert.throws(() => createProfile({ home: box.home, name: 'work', bundles: [] }), /already exists/);
  } finally {
    box.cleanup();
  }
});

test('removing needs confirmation and then deletes the directory', () => {
  const box = sandbox();
  try {
    createProfile({ home: box.home, name: 'work', bundles: [] });
    assert.throws(() => removeProfile({ home: box.home, name: 'work' }), /pass --yes/);
    const removed = removeProfile({ home: box.home, name: 'work', confirmed: true });
    assert.equal(removed.name, 'work');
    assert.equal(existsSync(join(box.home, 'profiles', 'work')), false);
  } finally {
    box.cleanup();
  }
});

test('removing an unknown profile names its directory', () => {
  const box = sandbox();
  try {
    mkdirSync(join(box.home, 'profiles'), { recursive: true });
    assert.throws(() => removeProfile({ home: box.home, name: 'ghost', confirmed: true }), /does not exist at/);
  } finally {
    box.cleanup();
  }
});

test('an invalid name is refused', () => {
  const box = sandbox();
  try {
    assert.throws(() => createProfile({ home: box.home, name: 'a/b', bundles: [] }), /not a valid profile name/);
  } finally {
    box.cleanup();
  }
});