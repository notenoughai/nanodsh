import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveInstance } from '../lib/instance.js';

function instance({ runtime, base } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-instance-'));
  const distro = join(home, 'node_modules', '@local', 'distro');
  mkdirSync(distro, { recursive: true });
  writeFileSync(join(home, 'distro.json'), JSON.stringify({ distro: '@local/distro', version: '0.0.0', api: 1 }));
  writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'dsh-instance', private: true, dependencies: { '@local/distro': 'file:./distro' } }));
  writeFileSync(join(distro, 'package.json'), JSON.stringify({
    name: '@local/distro',
    version: '0.0.0',
    dsh: { distro: { api: 1, defaultBundles: [] } },
    dependencies: base === undefined ? {} : { '@deepseek-ai/dsh-base': base },
  }));
  if (runtime !== undefined) {
    const dir = join(home, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-app-boot', version: runtime }));
  }
  return home;
}

test('the pin version is the runtime the instance provides', () => {
  const home = instance({ runtime: '0.2.2-rc.3' });
  assert.equal(resolveInstance(home).bundleVersion, '0.2.2-rc.3');
});

test('an aliased base does not change the pin version', () => {
  const home = instance({ runtime: '0.2.2-rc.3', base: 'npm:@nanodsh/dsh-base-trim@0.1.0' });
  assert.equal(resolveInstance(home).bundleVersion, '0.2.2-rc.3');
});

test('without an installed runtime there is no pin version', () => {
  const home = instance({ base: '0.2.2-rc.3' });
  assert.equal(resolveInstance(home).bundleVersion, undefined);
});
