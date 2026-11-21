import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const BIN = fileURLToPath(new URL('../bin/nanodsh.js', import.meta.url));

const MANIFEST = {
  name: '@nanodsh/distro-standard',
  version: '0.0.1',
  dsh: { distro: { api: 1, defaultBundles: ['@deepseek-ai/dsh-base'], allowBuilds: ['node-pty', 'koffi'] } },
  dependencies: { '@other/host': '1.0.0' },
};

const FAKE_PNPM = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, args.join(' ') + '\\n');
if (args[0] === 'view') {
  process.stdout.write(process.env.FAKE_VIEW ?? '');
  process.exit(Number(process.env.FAKE_VIEW_STATUS ?? 0));
}
if (args[0] === 'add') {
  if (process.env.FAKE_FAIL === '1') process.exit(1);
  const manifest = JSON.parse(process.env.FAKE_MANIFEST);
  const dependencies = { [manifest.name]: manifest.version };
  writeFileSync('package.json', JSON.stringify({ name: 'dsh-instance', private: true, dependencies }, null, 2) + '\\n');
  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
    const dir = join('node_modules', ...dependency.split('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: dependency, version }) + '\\n');
  }
  const own = join('node_modules', ...manifest.name.split('/'));
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, 'package.json'), JSON.stringify(manifest) + '\\n');
  if (process.env.FAKE_OBSTRUCT === '1') {
    mkdirSync(join('previous', 'node_modules'), { recursive: true });
    writeFileSync(join('previous', 'node_modules', 'stale.txt'), 'stale\\n');
  }
}
process.exit(0);
`;

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'nanodsh-distro-'));
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'pnpm'), FAKE_PNPM);
  chmodSync(join(bin, 'pnpm'), 0o755);
  return {
    root,
    bin,
    home: join(root, 'home'),
    config: join(root, 'config'),
    data: join(root, 'data'),
    log: join(root, 'pnpm.log'),
  };
}

function run(args, box, overrides = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: box.root,
    encoding: 'utf8',
    env: {
      PATH: `${box.bin}:${process.env.PATH}`,
      HOME: box.home,
      XDG_CONFIG_HOME: box.config,
      XDG_DATA_HOME: box.data,
      FAKE_LOG: box.log,
      FAKE_VIEW: JSON.stringify(MANIFEST),
      FAKE_MANIFEST: JSON.stringify(MANIFEST),
      ...overrides,
    },
  });
}

function calls(box) {
  return readFileSync(box.log, 'utf8').trim().split('\n');
}

test('distro add reads allowBuilds from the registry manifest', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const result = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(box), [
    'view @nanodsh/distro-standard@0.0.1 --json',
    'add --allow-build=node-pty --allow-build=koffi @nanodsh/distro-standard@0.0.1',
  ]);
  assert.equal(JSON.parse(readFileSync(join(home, 'distro.json'), 'utf8')).distro, '@nanodsh/distro-standard');
});

test('distro add warns and installs when the registry cannot be read', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const result = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box, { FAKE_VIEW_STATUS: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /could not read @nanodsh\/distro-standard@0\.0\.1 from the registry; installing without its allowBuilds/);
  assert.deepEqual(calls(box), ['view @nanodsh/distro-standard@0.0.1 --json', 'add @nanodsh/distro-standard@0.0.1']);
});

test('distro add reads a local directory without the registry', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const local = join(box.root, 'local-distro');
  mkdirSync(local);
  writeFileSync(join(local, 'package.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
  const result = run(['distro', 'add', `file:${local}`, '--home', home], box);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(box), [`add --allow-build=node-pty --allow-build=koffi file:${local}`]);
});

test('distro add accepts a launcher flag before the package', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const result = run(['distro', 'add', '--home', home, '@nanodsh/distro-standard@0.0.1'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(box), [
    'view @nanodsh/distro-standard@0.0.1 --json',
    'add --allow-build=node-pty --allow-build=koffi @nanodsh/distro-standard@0.0.1',
  ]);
  assert.equal(existsSync(join(home, 'distro.json')), true);
});

test('distro show counts declared hosts without a @deepseek-ai directory', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  assert.equal(run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box).status, 0);
  const shown = run(['distro', 'show', '--home', home], box);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /hosts\s+1 declared, 1 installed/);
  rmSync(join(home, 'node_modules', '@other'), { recursive: true });
  const missing = run(['distro', 'show', '--home', home], box);
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /hosts\s+1 declared, 0 installed/);
});

test('distro switch leaves the home unchanged when a move fails', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  assert.equal(run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box).status, 0);
  const before = readFileSync(join(home, 'package.json'), 'utf8');
  const result = run(['distro', 'switch', '@nanodsh/distro-standard@0.0.1', '--home', home], box, { FAKE_OBSTRUCT: '1' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /was left unchanged/);
  assert.equal(readFileSync(join(home, 'package.json'), 'utf8'), before);
  assert.deepEqual(readdirSync(home).filter((entry) => entry.startsWith('.distro-staging-')), []);
});

test('distro switch replaces the tree and removes its staging directory', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  assert.equal(run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box).status, 0);
  const result = run(['distro', 'switch', '@nanodsh/distro-standard@0.0.1', '--home', home], box);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /is now selected/);
  assert.deepEqual(readdirSync(home).filter((entry) => entry.startsWith('.distro-staging-')), []);
});

test('distro add refuses a directory that is not an instance', () => {
  const box = sandbox();
  const home = join(box.root, 'project');
  mkdirSync(home);
  writeFileSync(join(home, 'package.json'), '{"name":"my-own-app","dependencies":{}}\n');
  const result = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not an instance/);
  assert.equal(readFileSync(join(home, 'package.json'), 'utf8'), '{"name":"my-own-app","dependencies":{}}\n');
  assert.equal(existsSync(join(home, 'distro.json')), false);
  assert.equal(existsSync(box.log), false);
});

test('distro add refuses an instance that already selects a distro', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  assert.equal(run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box).status, 0);
  const before = readFileSync(join(home, 'package.json'), 'utf8');
  const second = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box);
  assert.equal(second.status, 1);
  assert.match(second.stderr, /already selects .*; run "nanodsh distro switch/);
  assert.equal(readFileSync(join(home, 'package.json'), 'utf8'), before);
  assert.equal(calls(box).length, 2);
});

test('plugin add forwards the allowBuilds of the selected distro', () => {
  const box = sandbox();
  const home = join(box.root, 'home');
  mkdirSync(join(home, 'node_modules', '@local', 'distro'), { recursive: true });
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true });
  writeFileSync(join(home, 'package.json'), `${JSON.stringify({ name: 'dsh-instance', private: true, dependencies: { '@local/distro': '1.0.0' } })}\n`);
  writeFileSync(join(home, 'distro.json'), `${JSON.stringify({ distro: '@local/distro', version: '1.0.0', api: 1 })}\n`);
  writeFileSync(join(home, 'node_modules', '@local', 'distro', 'package.json'), `${JSON.stringify({
    name: '@local/distro',
    version: '1.0.0',
    dsh: { distro: { api: 1, defaultBundles: [], allowBuilds: ['node-pty', 'koffi'] } },
    dependencies: {},
  })}\n`);
  writeFileSync(join(home, 'profiles', 'web', 'package.json'), `${JSON.stringify({ name: 'p', dsh: { profile: { bundles: [] } } })}\n`);
  const result = run(['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-web-app'], box, { DSH_HOME: home, FAKE_FAIL: '1' });
  assert.equal(result.status, 1);
  const lines = calls(box);
  assert.equal(lines.at(-1), 'add --allow-build=node-pty --allow-build=koffi @deepseek-ai/dsh-web-app');
});

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

function emptyInstance(box) {
  const home = join(box.root, 'instance');
  mkdirSync(join(home, 'profiles'), { recursive: true });
  writeFileSync(join(home, 'package.json'), `${JSON.stringify({ name: 'dsh-instance', private: true, type: 'module', dependencies: {} }, null, 2)}\n`);
  writeFileSync(join(home, 'pnpm-workspace.yaml'), 'packages:\n  - profiles/*\n');
  return home;
}

test('distro add leaves the home unchanged when the package is not a distro', () => {
  const box = sandbox();
  const home = emptyInstance(box);
  const before = snapshot(home);
  const result = run(['distro', 'add', '@nanodsh/not-a-distro@0.0.1', '--home', home], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.deepEqual(snapshot(home), before);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
  const retried = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box);
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(JSON.parse(readFileSync(join(home, 'distro.json'), 'utf8')).distro, '@nanodsh/distro-standard');
});

test('distro add leaves the home unchanged when the distro api does not match', () => {
  const box = sandbox();
  const home = emptyInstance(box);
  const before = snapshot(home);
  const result = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box, {
    FAKE_MANIFEST: JSON.stringify({ ...MANIFEST, dsh: { distro: { api: 2, defaultBundles: [] } } }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /declares api 2 but this launcher supports 1/);
  assert.deepEqual(snapshot(home), before);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
  const retried = run(['distro', 'add', '@nanodsh/distro-standard@0.0.1', '--home', home], box);
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(JSON.parse(readFileSync(join(home, 'distro.json'), 'utf8')).distro, '@nanodsh/distro-standard');
});

test('distro add removes the instance directory it created when the add fails', () => {
  const box = sandbox();
  const home = join(box.root, 'fresh');
  const result = run(['distro', 'add', '@nanodsh/not-a-distro@0.0.1', '--home', home], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.equal(existsSync(home), false);
});

test('instance create removes a home it made when the distro fails', () => {
  const box = sandbox();
  const home = join(box.root, 'fresh');
  const result = run(['instance', 'create', 'demo', '--home', home, '--distro', '@nanodsh/not-a-distro@0.0.1'], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.equal(existsSync(home), false);
  assert.equal(existsSync(join(box.config, 'nanodsh', 'instances.json')), false);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
});

test('instance create empties a home that existed empty when the distro fails', () => {
  const box = sandbox();
  const home = join(box.root, 'empty');
  mkdirSync(home);
  const result = run(['instance', 'create', 'demo', '--home', home, '--distro', '@nanodsh/not-a-distro@0.0.1'], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.equal(existsSync(home), true);
  assert.deepEqual(readdirSync(home), []);
  assert.equal(existsSync(join(box.config, 'nanodsh', 'instances.json')), false);
});

test('instance create leaves an existing instance untouched when the distro fails', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true });
  writeFileSync(join(home, 'package.json'), `${JSON.stringify({ name: 'dsh-instance', private: true, type: 'module', dependencies: {} }, null, 2)}\n`);
  writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{"name":"dsh-profile"}\n');
  writeFileSync(join(home, 'notes.txt'), 'keep me\n');
  const before = snapshot(home);
  const result = run(['instance', 'create', 'demo', '--home', home, '--distro', '@nanodsh/not-a-distro@0.0.1'], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.deepEqual(snapshot(home), before);
  assert.equal(existsSync(join(box.config, 'nanodsh', 'instances.json')), false);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
});

test('distro add empties a home that existed empty when the add fails', () => {
  const box = sandbox();
  const home = join(box.root, 'empty');
  mkdirSync(home);
  const result = run(['distro', 'add', '@nanodsh/not-a-distro@0.0.1', '--home', home], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.equal(existsSync(home), true);
  assert.deepEqual(readdirSync(home), []);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
});

test('distro add leaves an existing instance without a workspace file unchanged when the add fails', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  mkdirSync(join(home, 'profiles', 'web'), { recursive: true });
  writeFileSync(join(home, 'package.json'), `${JSON.stringify({ name: 'dsh-instance', private: true, type: 'module', dependencies: {} }, null, 2)}\n`);
  writeFileSync(join(home, 'profiles', 'web', 'package.json'), '{"name":"dsh-profile"}\n');
  writeFileSync(join(home, 'notes.txt'), 'keep me\n');
  const before = snapshot(home);
  const result = run(['distro', 'add', '@nanodsh/not-a-distro@0.0.1', '--home', home], box, {
    FAKE_MANIFEST: JSON.stringify({ name: '@nanodsh/not-a-distro', version: '0.0.1' }),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a distro/);
  assert.deepEqual(snapshot(home), before);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
});

const NO_REAL_PNPM = spawnSync('pnpm', ['--version'], { encoding: 'utf8' }).status === 0 ? false : 'pnpm is not on PATH';

function localDistro(box, name, version) {
  const dir = join(box.root, 'local', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: `@local/${name}`, version, dsh: { distro: { api: 1, defaultBundles: [] } } })}\n`);
  return dir;
}

function frozenInstall(home) {
  return spawnSync('pnpm', ['install', '--offline', '--frozen-lockfile'], { cwd: home, encoding: 'utf8', env: process.env });
}

test('a local distro add keeps the home installable with a frozen lockfile', { skip: NO_REAL_PNPM }, () => {
  const box = sandbox();
  const local = localDistro(box, 'file-distro', '1.0.0');
  const home = join(box.root, 'instance');
  const added = run(['distro', 'add', `file:${local}`, '--home', home], box, { PATH: process.env.PATH });
  assert.equal(added.status, 0, added.stderr);
  const lock = readFileSync(join(home, 'pnpm-lock.yaml'), 'utf8');
  assert.match(lock, /version: file:\.\.\/local\/file-distro\n/);
  assert.doesNotMatch(lock, /version: file:\.\.\/\.\.\//);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
  const frozen = frozenInstall(home);
  assert.equal(frozen.status, 0, frozen.stderr);
});

test('a local distro switch keeps the home installable with a frozen lockfile', { skip: NO_REAL_PNPM }, () => {
  const box = sandbox();
  const first = localDistro(box, 'first-distro', '1.0.0');
  const second = localDistro(box, 'second-distro', '2.0.0');
  const home = join(box.root, 'instance');
  const realPath = { PATH: process.env.PATH };
  assert.equal(run(['distro', 'add', `file:${first}`, '--home', home], box, realPath).status, 0);
  const switched = run(['distro', 'switch', `file:${second}`, '--home', home], box, realPath);
  assert.equal(switched.status, 0, switched.stderr);
  const lock = readFileSync(join(home, 'pnpm-lock.yaml'), 'utf8');
  assert.match(lock, /version: file:\.\.\/local\/second-distro\n/);
  assert.doesNotMatch(lock, /version: file:\.\.\/\.\.\//);
  assert.deepEqual(readdirSync(box.root).filter((entry) => entry.startsWith('.distro-staging-')), []);
  const frozen = frozenInstall(home);
  assert.equal(frozen.status, 0, frozen.stderr);
});

