import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as launcherAppBoot from '@deepseek-ai/dsh-app-boot';
import { loadAppBoot } from '../lib/app-boot.js';

function home(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nanodsh-app-boot-'));
  const dir = join(root, 'home');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true }));
  if (options.stub !== false) {
    const pkg = join(dir, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: '0.0.0', type: 'module', exports: { '.': './index.js' } }));
    writeFileSync(join(pkg, 'index.js'), "export const marker = 'instance';\nexport function boot() { throw new Error('instance boot'); }\n");
  }
  return dir;
}

test('loadAppBoot loads the copy the instance provides', async () => {
  const dir = home();
  const appBoot = await loadAppBoot(dir);
  assert.equal(appBoot.marker, 'instance');
});

test('loadAppBoot falls back to the launcher copy and says so', async () => {
  const dir = home({ stub: false });
  const written = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    const appBoot = await loadAppBoot(dir);
    assert.equal(appBoot.PluginPackages, launcherAppBoot.PluginPackages);
  } finally {
    process.stderr.write = write;
  }
  assert.match(written.join(''), /does not provide @deepseek-ai\/dsh-app-boot/);
  assert.match(written.join(''), /using the launcher copy/);
});

test('loadAppBoot loads one home once', async () => {
  const dir = home();
  const first = await loadAppBoot(dir);
  const second = await loadAppBoot(dir);
  assert.equal(first, second);
});
