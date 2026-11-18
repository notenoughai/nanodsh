#!/usr/bin/env node
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeConfig, createInstance, createProfile, selectHome } from '@nanodsh/core';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixture');
const root = mkdtempSync(join(tmpdir(), 'nanodsh-embed-'));
const env = { ...process.env, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data') };

try {
  const home = join(root, 'home');
  await createInstance({ name: 'demo', home, env });

  const selection = selectHome(['--instance', 'demo'], env);
  const profile = createProfile({ home: selection.home, name: 'demo-profile', bundles: ['example-bundle'] });

  const modules = join(profile.dir, 'node_modules');
  mkdirSync(modules, { recursive: true });
  cpSync(join(fixture, 'bundle'), join(modules, 'example-bundle'), { recursive: true });
  cpSync(join(fixture, 'plugin'), join(modules, 'example-plugin'), { recursive: true });

  const composed = composeConfig({ home: selection.home, profile: profile.name });
  for (const notice of composed.notices) process.stderr.write(notice);

  process.stdout.write(`instance  ${selection.name} at ${selection.home}\n`);
  process.stdout.write(`profile   ${profile.name} at ${profile.dir}\n`);
  process.stdout.write(`selection ${selection.source}\n\n`);
  process.stdout.write(composed.text);
} finally {
  rmSync(root, { recursive: true, force: true });
}