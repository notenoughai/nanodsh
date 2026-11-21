import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addDistro, switchDistro } from '@nanodsh/core';

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'nanodsh-distro-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function snapshot(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relative = path.slice(root.length + 1);
      if (entry.isDirectory()) {
        entries.push(`${relative}/`);
        walk(path);
      } else {
        entries.push(`${relative}:${readFileSync(path, 'utf8')}`);
      }
    }
  };
  walk(root);
  return entries.sort();
}

function refusingMkdtemp(seen) {
  return (template) => {
    seen.push(template);
    const error = new Error(`EACCES: permission denied, mkdtemp '${template}'`);
    error.code = 'EACCES';
    throw error;
  };
}

test('distro add names the directory that must hold a staging area for a local distro', async () => {
  const box = sandbox();
  try {
    const parent = join(box.root, 'locked');
    const home = join(parent, 'instance');
    mkdirSync(home, { recursive: true });
    const seen = [];
    await assert.rejects(
      addDistro('file:../local/dist', home, { mkdtemp: refusingMkdtemp(seen) }),
      (error) => {
        assert.equal(error.message.includes(parent), true, error.message);
        assert.match(error.message, /cannot create a staging directory in/);
        assert.match(error.message, /must be writable/);
        assert.match(error.message, /EACCES/);
        return true;
      },
    );
    assert.deepEqual(seen, [join(parent, '.distro-staging-')]);
    assert.deepEqual(readdirSync(home), []);
  } finally {
    box.cleanup();
  }
});

test('a registry distro stages inside the instance, never beside it', async () => {
  const box = sandbox();
  try {
    const parent = join(box.root, 'work');
    const home = join(parent, 'instance');
    mkdirSync(home, { recursive: true });
    const seen = [];
    await assert.rejects(addDistro('@nanodsh/distro-standard@0.0.1', home, { mkdtemp: refusingMkdtemp(seen) }), /EACCES/);
    assert.deepEqual(seen, [join(home, '.distro-staging-')]);
    assert.deepEqual(readdirSync(home), []);
  } finally {
    box.cleanup();
  }
});

test('distro switch leaves an instance untouched when it cannot stage a local distro', async () => {
  const box = sandbox();
  try {
    const home = join(box.root, 'instance');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'package.json'), '{"name":"dsh-instance","private":true,"type":"module","dependencies":{}}\n');
    const before = snapshot(home);
    const seen = [];
    await assert.rejects(switchDistro('file:../local/second', home, { mkdtemp: refusingMkdtemp(seen) }), /must be writable/);
    assert.deepEqual(seen, [join(box.root, '.distro-staging-')]);
    assert.deepEqual(snapshot(home), before);
  } finally {
    box.cleanup();
  }
});