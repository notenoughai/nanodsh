import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createInstance,
  defaultInstance,
  listInstances,
  readRegistry,
  removeInstance,
  renameInstance,
  setDefaultInstance,
  setInstance,
  showInstance,
} from '@nanodsh/core';

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'nanodsh-instances-'));
  const env = { XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data') };
  return { root, env, home: join(root, 'home'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('a created instance is registered and becomes the default', async () => {
  const box = sandbox();
  try {
    const created = await createInstance({ name: 'demo', home: box.home, env: box.env });
    assert.equal(created.home, box.home);
    assert.equal(readRegistry(box.env).instances.demo.home, box.home);
    assert.equal(defaultInstance({ env: box.env }), 'demo');
    assert.equal(showInstance({ name: 'demo', env: box.env }).exists, true);
  } finally {
    box.cleanup();
  }
});

test('the list reports every registered instance as plain rows', async () => {
  const box = sandbox();
  try {
    await createInstance({ name: 'one', home: join(box.home, 'one'), env: box.env });
    await createInstance({ name: 'two', home: join(box.home, 'two'), env: box.env });
    const rows = listInstances({ env: box.env });
    assert.deepEqual(rows.map((row) => row.name).sort(), ['one', 'two']);
    assert.equal(rows[0].exists, true);
  } finally {
    box.cleanup();
  }
});

test('a registered instance can be updated and renamed', async () => {
  const box = sandbox();
  try {
    await createInstance({ name: 'demo', home: box.home, env: box.env });
    await setInstance({ name: 'demo', profile: 'work', env: box.env });
    assert.equal(showInstance({ name: 'demo', env: box.env }).profile, 'work');
    renameInstance({ from: 'demo', to: 'other', env: box.env });
    assert.equal(defaultInstance({ env: box.env }), 'other');
    assert.equal(readRegistry(box.env).instances.demo, undefined);
  } finally {
    box.cleanup();
  }
});

test('removing a registration leaves the home alone', async () => {
  const box = sandbox();
  try {
    mkdirSync(box.home, { recursive: true });
    await createInstance({ name: 'demo', home: box.home, env: box.env });
    const removed = removeInstance({ name: 'demo', env: box.env });
    assert.equal(removed.purged, false);
    assert.equal(readRegistry(box.env).instances.demo, undefined);
    assert.equal(defaultInstance({ env: box.env }), undefined);
  } finally {
    box.cleanup();
  }
});

test('purging deletes the home and reports it', async () => {
  const box = sandbox();
  try {
    mkdirSync(box.home, { recursive: true });
    writeFileSync(join(box.home, 'stamp'), 'x');
    await createInstance({ name: 'demo', home: box.home, env: box.env });
    const removed = removeInstance({ name: 'demo', purge: true, env: box.env });
    assert.equal(removed.purged, true);
    assert.equal(listInstances({ env: box.env }).length, 0);
  } finally {
    box.cleanup();
  }
});

test('purging one of two instances on one home is refused', async () => {
  const box = sandbox();
  try {
    mkdirSync(box.home, { recursive: true });
    await createInstance({ name: 'one', home: box.home, env: box.env });
    await createInstance({ name: 'two', home: box.home, env: box.env });
    assert.throws(() => removeInstance({ name: 'one', purge: true, env: box.env }), /is shared with two/);
  } finally {
    box.cleanup();
  }
});

test('an unknown instance names the command that registers it', () => {
  const box = sandbox();
  try {
    assert.throws(() => showInstance({ name: 'ghost', env: box.env }), /instance "ghost" is not registered/);
  } finally {
    box.cleanup();
  }
});

test('setting the default refuses an unregistered name', async () => {
  const box = sandbox();
  try {
    await createInstance({ name: 'demo', home: box.home, env: box.env });
    assert.throws(() => setDefaultInstance({ name: 'ghost', env: box.env }), /is not registered/);
  } finally {
    box.cleanup();
  }
});