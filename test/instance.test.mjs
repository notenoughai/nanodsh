import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveInstance } from '../lib/instance.js';

function instance({ base, installed } = {}) {
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
  if (installed !== undefined) {
    const dir = join(home, 'node_modules', '@deepseek-ai', 'dsh-base');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@nanodsh/dsh-base-trim', version: installed }));
  }
  return home;
}

test('an aliased base reports the version installed under its name', () => {
  const home = instance({ base: 'npm:@nanodsh/dsh-base-trim@0.2.2-rc.3', installed: '0.2.2-rc.3' });
  assert.equal(resolveInstance(home).bundleVersion, '0.2.2-rc.3');
});

test('a plain declared base version is used when base is not installed', () => {
  const home = instance({ base: '0.2.2-rc.3' });
  assert.equal(resolveInstance(home).bundleVersion, '0.2.2-rc.3');
});

test('an aliased base that is not installed yields no version', () => {
  const home = instance({ base: 'file:/tmp/base-trim' });
  assert.equal(resolveInstance(home).bundleVersion, undefined);
});
