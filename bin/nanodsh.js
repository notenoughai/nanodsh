#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../lib/args.js';
import { runDistroCli } from '../lib/distro-cli.js';
import { runInstanceCli } from '../lib/instance-cli.js';
import { runPluginCli } from '../lib/plugin-cli.js';
import { runProfileCli } from '../lib/profile-cli.js';
import { renderCompletion, SHELLS } from '../lib/completions.js';
import { readRegistry } from '../lib/registry.js';
import { overriddenNotice, selectHome } from '../lib/selection.js';
import { dumpConfig, dumpConfigSchema, dumpDefaultConfig } from '../lib/dump-config.js';
import { runProfile } from '../lib/profile.js';
import { VERSION } from '../lib/version.js';

const argv = process.argv.slice(2);

function availableProfiles(home) {
  try {
    return readdirSync(join(home, 'profiles'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

try {
  if (argv[0] === 'completion') {
    const shell = argv[1];
    if (shell === undefined) {
      process.stderr.write(`nanodsh: completion needs a shell; expected one of ${SHELLS.join(', ')}\n`);
      process.exit(2);
    }
    try {
      process.stdout.write(renderCompletion(shell));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    }
  } else if (argv[0] === 'instance') {
    await runInstanceCli(argv.slice(1));
  } else if (argv[0] === 'plugin') {
    const selection = selectHome(argv.slice(1), process.env, { stopAtPositional: false });
    process.env.DSH_HOME = selection.home;
    process.stderr.write(overriddenNotice(selection));
    await runPluginCli(argv.slice(1));
  } else if (argv[0] === 'profile') {
    const selection = selectHome(argv.slice(1), process.env, { stopAtPositional: false });
    process.env.DSH_HOME = selection.home;
    process.stderr.write(overriddenNotice(selection));
    runProfileCli(argv.slice(1));
  } else if (argv[0] === 'distro') {
    const selection = selectHome(argv.slice(1), process.env, { stopAtPositional: false });
    process.env.DSH_HOME = selection.home;
    process.stderr.write(overriddenNotice(selection));
    await runDistroCli(argv.slice(1));
  } else {
    const selection = selectHome(argv);
    process.env.DSH_HOME = selection.home;
    if (argv.includes('--list-profiles')) {
      const names = availableProfiles(selection.home);
      if (names.length > 0) process.stdout.write(`${names.join('\n')}\n`);
      process.exit(0);
    }
    if (argv.includes('--list-instances')) {
      const names = Object.keys(readRegistry().instances).sort();
      if (names.length > 0) process.stdout.write(`${names.join('\n')}\n`);
      process.exit(0);
    }
    process.stderr.write(overriddenNotice(selection));
    const invocation = parseArgs(argv, VERSION);
    if (invocation.profile === undefined) {
      if (selection.profile !== undefined) invocation.profile = selection.profile;
      else {
        const available = availableProfiles(selection.home);
        throw new Error(`nanodsh: no profile selected and ${selection.home} registers none; profiles: ${available.length === 0 ? '(none)' : available.join(', ')}`);
      }
    }
    if (invocation.dump === 'config') dumpConfig(invocation);
    else if (invocation.dump === 'default') dumpDefaultConfig(invocation);
    else if (invocation.dump === 'schema') await dumpConfigSchema(invocation);
    else await runProfile(invocation);
  }
} catch (error) {
  process.stderr.write(`${error.message ?? error}\n`);
  process.exit(1);
}
