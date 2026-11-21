import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const BIN = fileURLToPath(new URL('../bin/nanodsh.js', import.meta.url));
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

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

function runAsync(args, box) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: box.root,
      env: {
        PATH: process.env.PATH,
        HOME: box.home,
        XDG_CONFIG_HOME: box.config,
        XDG_DATA_HOME: box.data,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function registry(box) {
  return JSON.parse(readFileSync(join(box.config, 'nanodsh', 'instances.json'), 'utf8'));
}

test('instance create accepts a flag before the name', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const result = run(['instance', 'create', '--home', home, 'work'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(registry(box).instances.work.home, home);
});

test('instance create refuses a flag without a value', () => {
  const box = sandbox();
  const result = run(['instance', 'create', 'work', '--home'], box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--home needs a value/);
  assert.equal(existsSync(join(box.config, 'nanodsh', 'instances.json')), false);
});

test('instance create resolves a relative home before registering it', () => {
  const box = sandbox();
  const cwd = join(box.root, 'elsewhere');
  mkdirSync(cwd);
  const result = run(['instance', 'create', 'rel', '--home', '../instances/rel'], box, { cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(registry(box).instances.rel.home, resolve(cwd, '../instances/rel'));
});

test('instance create makes the home it registers', () => {
  const box = sandbox();
  const home = join(box.root, 'made', 'deep');
  const result = run(['instance', 'create', 'work', '--home', home], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(home).isDirectory(), true);
  assert.equal(registry(box).instances.work.home, home);
});

test('instance create makes the data home when --home is absent', () => {
  const box = sandbox();
  const result = run(['instance', 'create', 'auto'], box);
  assert.equal(result.status, 0, result.stderr);
  const home = join(box.data, 'nanodsh', 'instances', 'auto');
  assert.equal(statSync(home).isDirectory(), true);
  assert.equal(registry(box).instances.auto.home, home);
});

test('instance add stays an alias of instance create', () => {
  const box = sandbox();
  const home = join(box.root, 'legacy');
  const result = run(['instance', 'add', 'old', '--home', home], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(home).isDirectory(), true);
  assert.equal(registry(box).instances.old.home, home);
});

test('instance help names create and hides the alias', () => {
  const box = sandbox();
  const result = run(['instance', '--help'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /create <name>/);
  assert.doesNotMatch(result.stdout, /add <name>/);
});

test('instance remove refuses to purge a home another instance uses', () => {
  const box = sandbox();
  const home = join(box.root, 'shared');
  assert.equal(run(['instance', 'create', 'a', '--home', home], box).status, 0);
  assert.equal(run(['instance', 'create', 'b', '--home', home], box).status, 0);
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

test('the launcher boots with the app-boot the instance provides', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const pkg = join(home, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
  mkdirSync(join(home, 'profiles', 'demo'), { recursive: true });
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true }));
  writeFileSync(join(home, 'profiles', 'demo', 'package.json'), JSON.stringify({ name: 'dsh-profile-demo', private: true, dsh: { profile: { bundles: [] } } }));
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.0.0', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(pkg, 'index.js'), [
    "import { join } from 'node:path';",
    'export const StartupError = class StartupError extends Error {};',
    'export const PluginPackages = class PluginPackages {};',
    'export function loadLayeredEnv() { return new Map(); }',
    "export function loadProfile(binName, name, installAnchor, home) { return { name, dir: join(home, 'profiles', name), patchPath: join(home, 'profiles', name, 'cordis.patch.yml'), layers: [{ packageName: 'stub-bundle' }] }; }",
    'export function reportSkippedBundles() {}',
    'export function loadOverlayPatches() { return {}; }',
    'export async function createRuntimeResolution() { return {}; }',
    'export function readProfilePatches() { return []; }',
    "export async function boot() { throw new Error('stub boot used'); }",
  ].join('\n'));

  const result = run(['demo'], box, { env: { DSH_HOME: home } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stub boot used/);
  assert.doesNotMatch(result.stderr, /does not provide @deepseek-ai\/dsh-app-boot/);
});

function proxyBootHome(box, proxySource) {
  const home = join(box.root, 'instance');
  mkdirSync(join(home, 'profiles', 'demo'), { recursive: true });
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true }));
  writeFileSync(join(home, 'profiles', 'demo', 'package.json'), JSON.stringify({ name: 'dsh-profile-demo', private: true, dsh: { profile: { bundles: [] } } }));
  const proxy = join(home, 'node_modules', '@deepseek-ai', 'dsh-http-proxy');
  mkdirSync(proxy, { recursive: true });
  writeFileSync(join(proxy, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-http-proxy', version: '0.0.0', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(proxy, 'index.js'), proxySource);
  return home;
}

test('a proxy that fails to install does not stop the boot', () => {
  const box = sandbox();
  const home = proxyBootHome(box, "export async function installProxyFromEnvironment() { throw new Error('the proxy module refused to install'); }\n");
  const result = run(['demo'], box, { env: { DSH_HOME: home } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the proxy was not installed \(the proxy module refused to install\)/);
  assert.match(result.stderr, /Proxy support needs Node\.js >= 22\.19\.0/);
  assert.match(result.stderr, /profile "demo" composes no entries/);
});

test('a proxy that installs cleanly warns about nothing', () => {
  const box = sandbox();
  const home = proxyBootHome(box, 'export async function installProxyFromEnvironment() { return async () => {}; }\n');
  const result = run(['demo'], box, { env: { DSH_HOME: home } });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /the proxy was not installed/);
  assert.match(result.stderr, /profile "demo" composes no entries/);
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

test('plugin add seeds a new profile with the distro default bundles', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const distro = join(home, 'node_modules', '@local', 'distro-fake');
  mkdirSync(distro, { recursive: true });
  writeFileSync(join(home, 'distro.json'), JSON.stringify({ distro: '@local/distro-fake', version: '0.0.0', api: 1 }));
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true, dependencies: { '@local/distro-fake': 'file:./distro' } }));
  writeFileSync(join(distro, 'package.json'), JSON.stringify({
    name: '@local/distro-fake',
    version: '0.0.0',
    dsh: { distro: { api: 1, defaultBundles: ['@deepseek-ai/dsh-base'] } },
  }));
  const bin = join(box.root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'pnpm'), 0o755);

  const result = run(['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-web-app'], box, {
    env: { DSH_HOME: home, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(home, 'profiles', 'web', 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base']);
});

test('plugin add pins host packages to the runtime version the instance provides', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const distro = join(home, 'node_modules', '@local', 'distro-fake');
  const base = join(home, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
  mkdirSync(distro, { recursive: true });
  mkdirSync(base, { recursive: true });
  writeFileSync(join(home, 'distro.json'), JSON.stringify({ distro: '@local/distro-fake', version: '0.0.0', api: 1 }));
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true, dependencies: { '@local/distro-fake': 'file:./distro' } }));
  writeFileSync(join(distro, 'package.json'), JSON.stringify({
    name: '@local/distro-fake',
    version: '0.0.0',
    dsh: { distro: { api: 1, defaultBundles: [] } },
    dependencies: { '@deepseek-ai/dsh-base': 'npm:@nanodsh/dsh-base-trim@0.2.2-rc.3' },
  }));
  writeFileSync(join(base, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.2.2-rc.3' }));
  const argsFile = join(box.root, 'pnpm-args');
  const bin = join(box.root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\nexit 0\n`);
  chmodSync(join(bin, 'pnpm'), 0o755);

  const result = run(['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-headless'], box, {
    env: { DSH_HOME: home, PATH: `${bin}:${process.env.PATH}` },
  });
  assert.equal(result.status, 0, result.stderr);
  const recorded = readFileSync(argsFile, 'utf8');
  assert.match(recorded, /@deepseek-ai\/dsh-headless@0\.2\.2-rc\.3/);
  assert.doesNotMatch(recorded, /file:|npm:/);
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
  assert.equal(run(['instance', 'create', 'real', '--home', real], box).status, 0);
  assert.equal(run(['instance', 'create', 'via-link', '--home', link], box).status, 0);
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
  assert.equal(run(['instance', 'create', 'only', '--home', link], box).status, 0);
  const removed = run(['instance', 'remove', 'only', '--purge', '--yes'], box);
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stderr, /symbolic link/);
  assert.equal(existsSync(join(real, 'precious.txt')), true);
  assert.equal(existsSync(link), false);
});

test('instance create refuses a regular file as a home', () => {
  const box = sandbox();
  const file = join(box.root, 'not-a-home');
  writeFileSync(file, 'x\n');
  const result = run(['instance', 'create', 'broken', '--home', file], box);
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
  assert.equal(run(['instance', 'create', 'prod', '--home', b], box).status, 0);
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

test('concurrent instance creates keep every entry', async () => {
  const box = sandbox();
  const names = ['one', 'two', 'three', 'four', 'five', 'six'];
  const results = await Promise.all(names.map((name) => runAsync(['instance', 'create', name, '--home', join(box.root, name)], box)));
  assert.deepEqual(results.map((result) => result.status), names.map(() => 0));
  assert.deepEqual(Object.keys(registry(box).instances).sort(), [...names].sort());
});

test('a stale registry lock does not block an instance command', () => {
  const box = sandbox();
  const lock = join(box.config, 'nanodsh', 'instances.json.lock');
  mkdirSync(lock, { recursive: true });
  const past = new Date(Date.now() - 60_000);
  utimesSync(lock, past, past);
  const result = run(['instance', 'create', 'work'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(registry(box).instances), ['work']);
});

test('no instance selected is refused instead of falling back to ~/.dsh', () => {
  const box = sandbox();
  const result = run(['distro', 'show'], box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no instance selected/);
  assert.match(result.stderr, /instance create default/);
  assert.equal(existsSync(join(box.home, '.dsh')), false);
});

test('a registered default instance is used without flags', () => {
  const box = sandbox();
  const home = join(box.root, 'inst');
  assert.equal(run(['instance', 'create', 'default', '--home', home], box).status, 0);
  const result = run(['distro', 'show'], box);
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`${home} has no distro selection`));
  assert.doesNotMatch(result.stderr, /no instance selected/);
});

test('version and help work without an instance', () => {
  const box = sandbox();
  const version = run(['--version'], box);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), PACKAGE_VERSION);
  const help = run(['--help'], box);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: nanodsh/);
});

test('listing profiles without an instance stays silent and succeeds', () => {
  const box = sandbox();
  const result = run(['--list-profiles'], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(existsSync(join(box.home, '.dsh')), false);
});

function cleanupProfile() {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-cleanup-'));
  const profile = join(home, 'profiles', 'cleanup');
  const bundle = join(profile, 'node_modules', 'cleanup-bundle');
  const plugin = join(profile, 'node_modules', 'cleanup-plugin');
  mkdirSync(bundle, { recursive: true });
  mkdirSync(plugin, { recursive: true });
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'cleanup-instance', private: true }));
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'cleanup-profile',
    private: true,
    dependencies: { 'cleanup-bundle': '*' },
    dsh: { profile: { bundles: ['cleanup-bundle'] } },
  }));
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'cleanup-bundle', version: '0.0.0', private: true, dsh: { bundle: { patch: './cordis.patch.yml' } },
  }));
  writeFileSync(join(bundle, 'cordis.patch.yml'), '- insert:\n    - id: cleanup\n      name: cleanup-plugin\n');
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({
    name: 'cleanup-plugin', version: '0.0.0', private: true, type: 'module', exports: './index.js',
  }));
  writeFileSync(join(plugin, 'index.js'), [
    "import { spawn } from 'node:child_process';",
    "import { writeFileSync } from 'node:fs';",
    '',
    "export const name = 'cleanup';",
    '',
    'export function apply(ctx) {',
    "  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    '  writeFileSync(process.env.CLEANUP_PID, String(child.pid));',
    '  ctx.effect(() => async () => {',
    "    child.kill('SIGTERM');",
    '    await new Promise((done) => {',
    '      const timer = setTimeout(done, 5000);',
    "      child.on('exit', () => { clearTimeout(timer); done(); });",
    '    });',
    "    writeFileSync(process.env.CLEANUP_DONE, 'done');",
    '  });',
    "  writeFileSync(process.env.CLEANUP_READY, 'ready');",
    '}',
    '',
  ].join('\n'));
  return home;
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the launcher did not exit')), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

test('a signal waits for the profile disposers before the launcher exits', async () => {
  const box = sandbox();
  const home = cleanupProfile();
  const pidFile = join(box.root, 'window.pid');
  const readyFile = join(box.root, 'ready');
  const doneFile = join(box.root, 'cleanup.done');
  const child = spawn(process.execPath, [BIN, '--profile', 'cleanup'], {
    cwd: box.root,
    env: {
      PATH: process.env.PATH,
      HOME: box.home,
      XDG_CONFIG_HOME: box.config,
      XDG_DATA_HOME: box.data,
      DSH_HOME: home,
      CLEANUP_PID: pidFile,
      CLEANUP_READY: readyFile,
      CLEANUP_DONE: doneFile,
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    assert.equal(await waitForFile(readyFile, 20000), true, `the profile never booted: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    child.kill('SIGTERM');
    const { code, signal } = await waitForExit(child, 20000);
    assert.equal(signal, null, `the launcher died from ${signal} instead of shutting down: ${stderr}`);
    assert.equal(code, 0, stderr);
    assert.equal(existsSync(doneFile), true, 'the disposer did not finish before the launcher exited');
    const windowPid = Number(readFileSync(pidFile, 'utf8'));
    assert.throws(() => process.kill(windowPid, 0), /ESRCH/);
    assert.doesNotMatch(stderr, /shutdown failed/);
  } finally {
    if (existsSync(pidFile)) {
      const windowPid = Number(readFileSync(pidFile, 'utf8'));
      try { process.kill(windowPid, 'SIGKILL'); } catch { /* the child is already gone */ }
    }
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

test('--dump-config composes with the app-boot the instance provides', () => {
  const box = sandbox();
  const home = join(box.root, 'instance');
  const pkg = join(home, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
  mkdirSync(join(home, 'profiles', 'demo'), { recursive: true });
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true }));
  writeFileSync(join(home, 'profiles', 'demo', 'package.json'), JSON.stringify({ name: 'dsh-profile-demo', private: true, dsh: { profile: { bundles: [] } } }));
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '9.9.9', type: 'module', exports: { '.': './index.js' } }));
  writeFileSync(join(pkg, 'index.js'), [
    "import { join } from 'node:path';",
    'export const StartupError = class StartupError extends Error {};',
    'export const PluginPackages = class PluginPackages {};',
    'export function loadLayeredEnv() { return new Map(); }',
    "export function loadProfile(binName, name, installAnchor, home) { return { name, dir: join(home, 'profiles', name), patchPath: join(home, 'profiles', name, 'cordis.patch.yml'), layers: [{ packageName: 'instance-bundle', patches: [] }], skippedBundles: [] }; }",
    'export function loadOptionalPatches() { return undefined; }',
    'export function loadOverlayPatches() { return []; }',
    "export function renderConfigDump() { return '# composed by the instance runtime\\n'; }",
    'export async function generateConfigSchema() { return { "x-cordis": { complete: true, diagnostics: [] } }; }',
    '',
  ].join('\n'));

  const result = run(['--profile', 'demo', '--dump-config'], box, { env: { DSH_HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '# composed by the instance runtime\n');
  assert.doesNotMatch(result.stderr, /skipping profile bundle/);
});

const FAKE_ADD_PNPM = `#!/usr/bin/env node
const { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const args = process.argv.slice(2);
if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, args.join(' ') + '\\n');
if (args[0] === 'remove') {
  const file = join(process.cwd(), 'package.json');
  const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  for (const argument of args.slice(1)) {
    if (argument.startsWith('-')) continue;
    if (manifest.dependencies) delete manifest.dependencies[argument];
    rmSync(join(process.cwd(), 'node_modules', argument), { recursive: true, force: true });
  }
  writeFileSync(file, JSON.stringify(manifest, null, 2) + '\\n');
  process.exit(0);
}
if (args[0] !== 'add') process.exit(0);
const file = join(process.cwd(), 'package.json');
const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
manifest.dependencies = { ...(manifest.dependencies || {}) };
for (const argument of args.slice(1)) {
  if (argument.startsWith('-')) continue;
  const at = argument.indexOf('@', 1);
  const name = at === -1 ? argument : argument.slice(0, at);
  const version = at === -1 ? '0.0.0' : argument.slice(at + 1);
  manifest.dependencies[name] = version;
  const dir = join(process.cwd(), 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, dsh: { bundle: { patch: './cordis.patch.yml' } } }));
}
writeFileSync(file, JSON.stringify(manifest, null, 2) + '\\n');
process.exit(0);
`;

function pluginFixture(box) {
  const home = join(box.root, 'instance');
  const distro = join(home, 'node_modules', '@local', 'distro-fake');
  const runtime = join(home, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
  mkdirSync(distro, { recursive: true });
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(home, 'distro.json'), JSON.stringify({ distro: '@local/distro-fake', version: '0.0.0', api: 1 }));
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true, dependencies: { '@local/distro-fake': 'file:./distro' } }));
  writeFileSync(join(distro, 'package.json'), JSON.stringify({
    name: '@local/distro-fake',
    version: '0.0.0',
    dsh: { distro: { api: 1, defaultBundles: ['@deepseek-ai/dsh-base'] } },
  }));
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.2.2-rc.3' }));
  const profile = join(home, 'profiles', 'web');
  mkdirSync(join(profile, 'node_modules', '@deepseek-ai', 'dsh-base'), { recursive: true });
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: { '@deepseek-ai/dsh-base': '0.2.2-rc.3' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }));
  writeFileSync(join(profile, 'node_modules', '@deepseek-ai', 'dsh-base', 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-base', version: '0.2.2-rc.3', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }));
  const bin = join(box.root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'pnpm'), FAKE_ADD_PNPM);
  chmodSync(join(bin, 'pnpm'), 0o755);
  return { home, bin, profile, log: join(box.root, 'pnpm-args') };
}

function pluginRun(box, fixture, args) {
  return run(args, box, { env: { DSH_HOME: fixture.home, PATH: `${fixture.bin}:${process.env.PATH}`, FAKE_LOG: fixture.log } });
}

test('plugin add --plain installs without composing', () => {
  const box = sandbox();
  const fixture = pluginFixture(box);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'add', '--plain', '@deepseek-ai/dsh-web-app']);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(fixture.profile, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base']);
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-web-app'], '0.2.2-rc.3');
  assert.match(result.stdout, /installed without composing/);
  assert.doesNotMatch(result.stdout, /installed but not a bundle/);
  assert.match(readFileSync(fixture.log, 'utf8'), /@deepseek-ai\/dsh-web-app@0\.2\.2-rc\.3/);
  assert.doesNotMatch(readFileSync(fixture.log, 'utf8'), /--plain/);
});

test('a plain install stays out of the bundles after the next add', () => {
  const box = sandbox();
  const fixture = pluginFixture(box);
  assert.equal(pluginRun(box, fixture, ['plugin', '--profile', 'web', 'add', '--plain', '@deepseek-ai/dsh-web-app']).status, 0);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-headless']);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(fixture.profile, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.dsh.profile.bundles, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']);
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-web-app'], '0.2.2-rc.3');
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-headless'], '0.2.2-rc.3');
  assert.match(result.stdout, /bundles: @deepseek-ai\/dsh-base, @deepseek-ai\/dsh-headless/);
  assert.doesNotMatch(result.stdout, /installed without composing/);
});

test('--plain is read on either side of the package name', () => {
  for (const args of [
    ['plugin', '--profile', 'web', 'add', '--plain', '@deepseek-ai/dsh-web-app'],
    ['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-web-app', '--plain'],
  ]) {
    const box = sandbox();
    const fixture = pluginFixture(box);
    const result = pluginRun(box, fixture, args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /installed without composing/);
    assert.doesNotMatch(readFileSync(fixture.log, 'utf8'), /--plain/);
  }
});

test('--plain is refused by the commands that compose', () => {
  for (const command of ['remove', 'install', 'update']) {
    const box = sandbox();
    const fixture = pluginFixture(box);
    const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', command, '--plain', '@deepseek-ai/dsh-web-app']);
    assert.equal(result.status, 1, `${command} accepted --plain`);
    assert.match(result.stderr, /--plain only applies to "add"/);
    assert.equal(existsSync(fixture.log), false);
  }
});

function allowBuildFixture(box) {
  const fixture = pluginFixture(box);
  const file = join(fixture.home, 'node_modules', '@local', 'distro-fake', 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.dsh.distro.allowBuilds = ['node-pty', 'koffi'];
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return fixture;
}

test('plugin update forwards no build flags', () => {
  const box = sandbox();
  const fixture = allowBuildFixture(box);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'update']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(fixture.log, 'utf8').trim(), 'update');
});

test('plugin install still forwards the build flags', () => {
  const box = sandbox();
  const fixture = allowBuildFixture(box);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'install']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(fixture.log, 'utf8').trim(), 'install --allow-build=node-pty --allow-build=koffi');
});

test('a failed update does not suggest approving build scripts', () => {
  const box = sandbox();
  const fixture = allowBuildFixture(box);
  writeFileSync(join(fixture.bin, 'pnpm'), '#!/bin/sh\nexit 2\n');
  chmodSync(join(fixture.bin, 'pnpm'), 0o755);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'update']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pnpm update exited 2/);
  assert.doesNotMatch(result.stderr, /approve-builds/);
});

test('a failed add still names approve-builds', () => {
  const box = sandbox();
  const fixture = allowBuildFixture(box);
  writeFileSync(join(fixture.bin, 'pnpm'), '#!/bin/sh\nexit 2\n');
  chmodSync(join(fixture.bin, 'pnpm'), 0o755);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-headless']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pnpm add .* exited 2; if pnpm reported ignored build scripts, run "pnpm approve-builds --all"/);
});

function printedBundles(stdout) {
  const line = stdout.split('\n').find((entry) => entry.includes(' bundles: '));
  if (line === undefined) return undefined;
  const listed = line.slice(line.indexOf(' bundles: ') + ' bundles: '.length);
  return listed === '(none)' ? [] : listed.split(', ');
}

function manifestBundles(home, profile) {
  return JSON.parse(readFileSync(join(home, 'profiles', profile, 'package.json'), 'utf8')).dsh.profile.bundles;
}

test('plugin add reports the bundle list the profile manifest holds', () => {
  const box = sandbox();
  const fixture = pluginFixture(box);
  const created = run(['profile', 'create', 'work'], box, { env: { DSH_HOME: fixture.home } });
  assert.equal(created.status, 0, created.stderr);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'work', 'add', '@deepseek-ai/dsh-headless']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(manifestBundles(fixture.home, 'work'), ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']);
  assert.deepEqual(printedBundles(result.stdout), manifestBundles(fixture.home, 'work'));
});

test('plugin remove reports the bundle list left in the manifest', () => {
  const box = sandbox();
  const fixture = pluginFixture(box);
  assert.equal(run(['profile', 'create', 'work'], box, { env: { DSH_HOME: fixture.home } }).status, 0);
  assert.equal(pluginRun(box, fixture, ['plugin', '--profile', 'work', 'add', '@deepseek-ai/dsh-headless']).status, 0);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'work', 'remove', '@deepseek-ai/dsh-headless']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(manifestBundles(fixture.home, 'work'), ['@deepseek-ai/dsh-base']);
  assert.deepEqual(printedBundles(result.stdout), manifestBundles(fixture.home, 'work'));
});

test('a plain add reports the bundles it left untouched', () => {
  const box = sandbox();
  const fixture = pluginFixture(box);
  const result = pluginRun(box, fixture, ['plugin', '--profile', 'web', 'add', '--plain', '@deepseek-ai/dsh-web-app']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(manifestBundles(fixture.home, 'web'), ['@deepseek-ai/dsh-base']);
  assert.deepEqual(printedBundles(result.stdout), manifestBundles(fixture.home, 'web'));
  assert.match(result.stdout, /installed without composing/);
});
