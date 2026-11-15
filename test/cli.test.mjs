import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('profile remove keeps the directory a symlink points at', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  const outside = join(box.root, 'outside');
  mkdirSync(join(dshHome, 'profiles'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(outside, 'precious.txt'), 'keep\n');
  symlinkSync(outside, join(dshHome, 'profiles', 'linked'));
  const result = run(['profile', 'remove', 'linked', '--yes'], box, { env: { DSH_HOME: dshHome } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(outside, 'precious.txt')), true);
  assert.equal(existsSync(join(dshHome, 'profiles', 'linked')), false);
});

test('instance remove --purge sees a home another instance reaches through a symlink', () => {
  const box = sandbox();
  const real = join(box.root, 'real');
  const link = join(box.root, 'link');
  mkdirSync(real, { recursive: true });
  symlinkSync(real, link);
  assert.equal(run(['instance', 'add', 'real', '--home', real], box).status, 0);
  assert.equal(run(['instance', 'add', 'via-link', '--home', link], box).status, 0);
  writeFileSync(join(real, 'precious.txt'), 'keep\n');
  const refused = run(['instance', 'remove', 'via-link', '--purge', '--yes'], box);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /shared with real/);
  assert.equal(existsSync(join(real, 'precious.txt')), true);
});

test('instance remove --purge removes a symlink and leaves its target', () => {
  const box = sandbox();
  const real = join(box.root, 'real');
  const link = join(box.root, 'link');
  mkdirSync(real, { recursive: true });
  writeFileSync(join(real, 'precious.txt'), 'keep\n');
  symlinkSync(real, link);
  assert.equal(run(['instance', 'add', 'only', '--home', link], box).status, 0);
  const removed = run(['instance', 'remove', 'only', '--purge', '--yes'], box);
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stderr, /symbolic link/);
  assert.equal(existsSync(join(real, 'precious.txt')), true);
  assert.equal(existsSync(link), false);
});

test('instance add refuses a regular file as a home', () => {
  const box = sandbox();
  const file = join(box.root, 'not-a-home');
  writeFileSync(file, 'x\n');
  const result = run(['instance', 'add', 'broken', '--home', file], box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a directory/);
  assert.equal(existsSync(join(box.config, 'nanodsh', 'instances.json')), false);
});

test('profile create accepts a flag before the name', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  mkdirSync(dshHome, { recursive: true });
  const result = run(['profile', 'create', '--home', dshHome, 'work'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dshHome, 'profiles', 'work', 'package.json')), true);
});

test('profile create refuses a bundle flag without a value', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  mkdirSync(dshHome, { recursive: true });
  const result = run(['profile', 'create', 'second', '--bundle'], box, { env: { DSH_HOME: dshHome } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--bundle needs a value/);
  assert.equal(existsSync(join(dshHome, 'profiles', 'second')), false);
});

test('the launcher applies --home placed after the profile name', () => {
  const box = sandbox();
  const a = join(box.root, 'a');
  const b = join(box.root, 'b');
  mkdirSync(a, { recursive: true });
  mkdirSync(join(b, 'profiles', 'web'), { recursive: true });
  writeFileSync(join(b, 'profiles', 'web', 'package.json'), '{"name":"p","dsh":{"profile":{"bundles":[]}}}\n');
  const result = run(['web', '--home', b], box, { env: { DSH_HOME: a } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /composes no entries/);
  assert.equal(result.stderr.includes(join(a, 'profiles')), false);
});

test('the launcher applies --instance placed after the profile name', () => {
  const box = sandbox();
  const a = join(box.root, 'a');
  const b = join(box.root, 'b');
  mkdirSync(a, { recursive: true });
  mkdirSync(join(b, 'profiles', 'web'), { recursive: true });
  writeFileSync(join(b, 'profiles', 'web', 'package.json'), '{"name":"p","dsh":{"profile":{"bundles":[]}}}\n');
  assert.equal(run(['instance', 'add', 'prod', '--home', b], box).status, 0);
  const result = run(['web', '--instance', 'prod'], box, { env: { DSH_HOME: a } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /composes no entries/);
  assert.equal(result.stderr.includes(join(a, 'profiles')), false);
});

test('the overridden-home notice is printed once', () => {
  const box = sandbox();
  const a = join(box.root, 'a');
  const b = join(box.root, 'b');
  mkdirSync(a, { recursive: true });
  mkdirSync(b, { recursive: true });
  const overridden = run(['distro', 'show', '--home', b], box, { env: { DSH_HOME: a } });
  assert.equal(overridden.status, 1);
  assert.match(overridden.stderr, /is overridden/);
  const same = run(['distro', 'show', '--home', a], box, { env: { DSH_HOME: a } });
  assert.doesNotMatch(same.stderr, /is overridden/);
});

test('dumping a profile does not need write access', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  const profile = join(dshHome, 'profiles', 'web');
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'package.json'), '{"name":"p","dsh":{"profile":{"bundles":[]}}}\n');
  chmodSync(profile, 0o500);
  const result = run(['--profile', 'web', '--dump-config'], box, { env: { DSH_HOME: dshHome } });
  chmodSync(profile, 0o700);
  assert.equal(result.status, 0, result.stderr);
});

test('dumping leaves no root config behind, booting writes one', () => {
  const box = sandbox();
  const dshHome = join(box.root, 'dsh');
  const profile = join(dshHome, 'profiles', 'web');
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, 'package.json'), '{"name":"p","dsh":{"profile":{"bundles":[]}}}\n');
  const dumped = run(['--profile', 'web', '--dump-config'], box, { env: { DSH_HOME: dshHome } });
  assert.equal(dumped.status, 0, dumped.stderr);
  assert.equal(existsSync(join(profile, 'cordis.yml')), false);
  const booted = run(['--profile', 'web'], box, { env: { DSH_HOME: dshHome } });
  assert.equal(booted.status, 1);
  assert.match(booted.stderr, /composes no entries/);
  assert.equal(existsSync(join(profile, 'cordis.yml')), true);
});
