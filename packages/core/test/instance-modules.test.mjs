import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as launcherAppBoot from '@deepseek-ai/dsh-app-boot';
import * as launcherHttpProxy from '@deepseek-ai/dsh-http-proxy';
import { loadAppBoot, loadInstanceModule } from '@nanodsh/core';

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

test('loadAppBoot falls back to the launcher copy and hands the warning to the caller', async () => {
  const dir = home({ stub: false });
  const written = [];
  const appBoot = await loadAppBoot(dir, { warn: (line) => written.push(line) });
  assert.equal(appBoot.PluginPackages, launcherAppBoot.PluginPackages);
  assert.match(written.join(''), /does not provide @deepseek-ai\/dsh-app-boot/);
  assert.match(written.join(''), /using the launcher copy/);
});

test('loadInstanceModule loads one home once', async () => {
  const dir = home();
  const first = await loadInstanceModule(dir, '@deepseek-ai/dsh-http-proxy');
  const second = await loadInstanceModule(dir, '@deepseek-ai/dsh-http-proxy');
  assert.equal(first, second);
});

test('loadInstanceModule falls back for http-proxy too', async () => {
  const dir = home({ stub: false });
  const written = [];
  const loaded = await loadInstanceModule(dir, '@deepseek-ai/dsh-http-proxy', { warn: (line) => written.push(line) });
  assert.equal(loaded.installProxyFromEnvironment, launcherHttpProxy.installProxyFromEnvironment);
  assert.match(written.join(''), /does not provide @deepseek-ai\/dsh-http-proxy/);
});

test('loadAppBoot loads one home once', async () => {
  const dir = home();
  const first = await loadAppBoot(dir);
  const second = await loadAppBoot(dir);
  assert.equal(first, second);
});
