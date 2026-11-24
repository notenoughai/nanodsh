import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { resolveInstance } from '@nanodsh/core';

const roots = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function instance({ runtime, base } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-instance-'));
  roots.push(home);
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

test('the install anchor is the selected distro manifest', () => {
  const home = instance({ runtime: '0.2.2-rc.3' });
  assert.equal(resolveInstance(home).installAnchor, join(home, 'node_modules', '@local', 'distro', 'package.json'));
});

test('a selected distro that is not installed keeps the distro add hint', () => {
  const home = instance({ runtime: '0.2.2-rc.3' });
  rmSync(join(home, 'node_modules', '@local', 'distro'), { recursive: true, force: true });
  assert.throws(
    () => resolveInstance(home),
    /distro "@local\/distro" is selected but not installed in .*node_modules; run "nanodsh distro add @local\/distro"/,
  );
});
