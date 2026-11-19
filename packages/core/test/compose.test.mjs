import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { composeConfig, composeDefaultConfig, composeSchema, createProfile } from '@nanodsh/core';

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-compose-'));
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function instanceRuntime(home, { text, schema }) {
  const dir = join(home, 'node_modules', '@deepseek-ai', 'dsh-app-boot');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-app-boot',
    version: '9.9.9',
    type: 'module',
    exports: { '.': './index.js' },
  }));
  writeFileSync(join(dir, 'index.js'), [
    "import { join } from 'node:path';",
    'export const StartupError = class StartupError extends Error {};',
    'export const PluginPackages = class PluginPackages {};',
    'export function loadLayeredEnv() { return new Map(); }',
    "export function loadProfile(binName, name, installAnchor, home) { return { name, dir: join(home, 'profiles', name), patchPath: join(home, 'profiles', name, 'cordis.patch.yml'), layers: [{ packageName: 'instance-bundle', patches: [] }], skippedBundles: [] }; }",
    'export function loadOptionalPatches() { return undefined; }',
    'export function loadOverlayPatches() { return []; }',
    `export function renderConfigDump() { return ${JSON.stringify(text)}; }`,
    `export async function generateConfigSchema() { return ${JSON.stringify(schema)}; }`,
    '',
  ].join('\n'));
}

test('a composed tree comes back as text, not as output', async () => {
  const box = sandbox();
  try {
    const profile = createProfile({ home: box.home, name: 'quiet', bundles: [] });
    const composed = await composeConfig({ home: box.home, profile: profile.name });
    assert.equal(typeof composed.text, 'string');
    assert.equal(Array.isArray(composed.notices), true);
  } finally {
    box.cleanup();
  }
});

test('a profile that composes no entries still composes', async () => {
  const box = sandbox();
  try {
    const profile = createProfile({ home: box.home, name: 'empty', bundles: [] });
    const composed = await composeConfig({ home: box.home, profile: profile.name });
    assert.equal(composed.text.trim().length, 0);
    assert.deepEqual(composed.notices, []);
  } finally {
    box.cleanup();
  }
});

test('a dump composes with the instance runtime, not the launcher copy', async () => {
  const box = sandbox();
  try {
    instanceRuntime(box.home, { text: '# composed by the instance runtime\n', schema: { 'x-cordis': { complete: true, diagnostics: [] } } });
    const profile = createProfile({ home: box.home, name: 'web', bundles: [] });
    const composed = await composeConfig({ home: box.home, profile: profile.name });
    assert.equal(composed.text, '# composed by the instance runtime\n');
    assert.deepEqual(composed.notices, []);
  } finally {
    box.cleanup();
  }
});

test('a default dump also composes with the instance runtime', async () => {
  const box = sandbox();
  try {
    instanceRuntime(box.home, { text: '# default tree from the instance runtime\n', schema: { 'x-cordis': { complete: true, diagnostics: [] } } });
    const profile = createProfile({ home: box.home, name: 'web', bundles: [] });
    const composed = await composeDefaultConfig({ home: box.home, profile: profile.name });
    assert.equal(composed.text, '# default tree from the instance runtime\n');
  } finally {
    box.cleanup();
  }
});

test('a schema dump also comes from the instance runtime', async () => {
  const box = sandbox();
  try {
    instanceRuntime(box.home, {
      text: '',
      schema: { 'x-cordis': { complete: false, diagnostics: [{ level: 'error', path: 'bundle.row', message: 'the instance runtime said no' }] } },
    });
    const profile = createProfile({ home: box.home, name: 'web', bundles: [] });
    const composed = await composeSchema({ home: box.home, profile: profile.name });
    assert.equal(composed.complete, false);
    assert.deepEqual(composed.diagnostics, ['nanodsh: error: [bundle.row] the instance runtime said no\n']);
  } finally {
    box.cleanup();
  }
});