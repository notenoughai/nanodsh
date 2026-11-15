import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const BIN = fileURLToPath(new URL('../bin/nanodsh.js', import.meta.url));

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'nanodsh-cli-'));
  const box = {
    root,
    home: join(root, 'home'),
    config: join(root, 'config'),
    data: join(root, 'data'),
  };
  mkdirSync(box.home, { recursive: true });
  return box;
}

function run(args, box, { cwd = box.root, env = {} } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: box.home,
      XDG_CONFIG_HOME: box.config,
      XDG_DATA_HOME: box.data,
      ...env,
    },
  });
}

function registry(box) {
  return JSON.parse(readFileSync(join(box.config, 'nanodsh', 'instances.json'), 'utf8'));
}

test('instance add accepts a flag before the name', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const result = run(['instance', 'add', '--home', home, 'work'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(registry(box).instances.work.home, home);
});

test('instance add refuses a flag without a value', () => {
  const box = sandbox();
  const result = run(['instance', 'add', 'work', '--home'], box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--home needs a value/);
  assert.equal(existsSync(join(box.config, 'nanodsh', 'instances.json')), false);
});

test('instance add resolves a relative home before registering it', () => {
  const box = sandbox();
  const cwd = join(box.root, 'elsewhere');
  mkdirSync(cwd);
  const result = run(['instance', 'add', 'rel', '--home', '../instances/rel'], box, { cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(registry(box).instances.rel.home, resolve(cwd, '../instances/rel'));
});

test('instance remove refuses to purge a home another instance uses', () => {
  const box = sandbox();
  const home = join(box.root, 'shared');
  assert.equal(run(['instance', 'add', 'a', '--home', home], box).status, 0);
  assert.equal(run(['instance', 'add', 'b', '--home', home], box).status, 0);
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'precious.txt'), 'keep\n');

  const refused = run(['instance', 'remove', 'a', '--purge', '--yes'], box);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /shared with b/);
  assert.equal(existsSync(join(home, 'precious.txt')), true);

  const removed = run(['instance', 'remove', 'a'], box);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(existsSync(join(home, 'precious.txt')), true);
  assert.deepEqual(Object.keys(registry(box).instances), ['b']);
});

test('plugin refuses a profile name that leaves profiles/', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  mkdirSync(join(dshHome, 'profiles'), { recursive: true });
  const result = run(['plugin', '--profile', '../escaped', 'add', 'some-package'], box, { env: { DSH_HOME: dshHome } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a valid profile name/);
  assert.equal(existsSync(join(dshHome, 'escaped')), false);
});

test('profile create still refuses an invalid name', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  const result = run(['profile', 'create', '../escaped'], box, { env: { DSH_HOME: dshHome } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a valid profile name/);
});
