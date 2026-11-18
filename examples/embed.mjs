#!/usr/bin/env node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeConfig, createInstance, createProfile, selectHome } from '@nanodsh/core';

const root = mkdtempSync(join(tmpdir(), 'nanodsh-embed-'));
const env = { ...process.env, XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data') };

try {
  const home = join(root, 'home');
  await createInstance({ name: 'demo', home, env });

  const selection = selectHome(['--instance', 'demo'], env);
  const profile = createProfile({ home: selection.home, name: 'demo-profile', bundles: [] });

  const composed = composeConfig({ home: selection.home, profile: profile.name });
  for (const notice of composed.notices) process.stderr.write(notice);

  process.stdout.write(`instance  ${selection.name} at ${selection.home}\n`);
  process.stdout.write(`profile   ${profile.name} at ${profile.dir}\n`);
  process.stdout.write(`selection ${selection.source}\n`);
  const tree = composed.text.trimEnd();
  process.stdout.write(tree.length === 0 ? '(the profile composes no layers)\n' : `${tree}\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}