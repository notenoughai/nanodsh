#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../lib/args.js';
import { runDistroCli } from '../lib/distro-cli.js';
import { runInstanceCli } from '../lib/instance-cli.js';
import { runPluginCli } from '../lib/plugin-cli.js';
import { runProfileCli } from '../lib/profile-cli.js';
import { renderCompletion, SHELLS } from '../lib/completions.js';
import {
  VERSION,
  boot,
  composeConfig,
  composeDefaultConfig,
  composeSchema,
  overriddenNotice,
  readRegistry,
  selectHome,
} from '@nanodsh/core';

const argv = process.argv.slice(2);
const env = process.env;

function warn(line) {
  process.stderr.write(line);
}

function announce(selection) {
  warn(overriddenNotice(selection, env));
}

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

function handleSignals(session) {
  const interrupt = (code) => {
    void session.stop(code).then((settled) => process.exit(settled));
  };
  process.on('SIGINT', () => interrupt(130));
  process.on('SIGTERM', () => interrupt(0));
}

async function dump(invocation, home) {
  if (invocation.dump === 'config') {
    const composed = await composeConfig({ home, profile: invocation.profile, fromDefaultProfile: invocation.fromDefaultProfile, patches: invocation.patches });
    for (const notice of composed.notices) warn(notice);
    process.stdout.write(composed.text);
    return;
  }
  if (invocation.dump === 'default') {
    const composed = await composeDefaultConfig({ home, profile: invocation.profile, fromDefaultProfile: invocation.fromDefaultProfile });
    for (const notice of composed.notices) warn(notice);
    process.stdout.write(composed.text);
    return;
  }
  const composed = await composeSchema({ home, profile: invocation.profile, fromDefaultProfile: invocation.fromDefaultProfile, patches: invocation.patches });
  for (const notice of composed.notices) warn(notice);
  process.stdout.write(`${JSON.stringify(composed.dump, null, 2)}\n`);
  for (const line of composed.diagnostics) warn(line);
  if (!composed.complete) process.exitCode = 1;
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
    await runInstanceCli(argv.slice(1), { env });
  } else if (argv[0] === 'plugin') {
    const selection = selectHome(argv.slice(1), env, { stopAtPositional: false });
    announce(selection);
    await runPluginCli(argv.slice(1), { home: selection.home });
  } else if (argv[0] === 'profile') {
    const selection = selectHome(argv.slice(1), env, { stopAtPositional: false });
    announce(selection);
    runProfileCli(argv.slice(1), { home: selection.home });
  } else if (argv[0] === 'distro') {
    const selection = selectHome(argv.slice(1), env, { stopAtPositional: false });
    announce(selection);
    await runDistroCli(argv.slice(1), { home: selection.home });
  } else {
    const listProfiles = argv.includes('--list-profiles');
    const listInstances = argv.includes('--list-instances');
    if (listProfiles || listInstances) {
      let selection;
      try {
        selection = selectHome(argv, env);
      } catch {
        process.exit(0);
      }
      const names = listProfiles ? availableProfiles(selection.home) : Object.keys(readRegistry(env).instances).sort();
      if (names.length > 0) process.stdout.write(`${names.join('\n')}\n`);
      process.exit(0);
    }
    const invocation = parseArgs(argv, VERSION);
    let active = selectHome(argv, env);
    if (invocation.home !== undefined || invocation.instance !== undefined) {
      active = selectHome(invocation.home !== undefined ? ['--home', invocation.home] : ['--instance', invocation.instance], env);
    }
    announce(active);
    if (invocation.profile === undefined) {
      if (active.profile !== undefined) invocation.profile = active.profile;
      else {
        const available = availableProfiles(active.home);
        throw new Error(`nanodsh: no profile selected and ${active.home} registers none; profiles: ${available.length === 0 ? '(none)' : available.join(', ')}`);
      }
    }
    if (invocation.dump !== undefined) await dump(invocation, active.home);
    else {
      const session = await boot({
        home: active.home,
        profile: invocation.profile,
        fromDefaultProfile: invocation.fromDefaultProfile,
        patches: invocation.patches,
        args: invocation.args,
        env,
        warn,
      });
      for (const notice of session.notices) warn(notice);
      handleSignals(session);
      await session.ready;
      process.exit(await session.exited);
    }
  }
} catch (error) {
  if (error.startupFailure !== undefined) {
    warn(error.message);
    if (error.startupFailure.written) warn(`\nFull diagnostics: ${error.startupFailure.file}\n`);
    else {
      for (const line of error.startupFailure.warnings) warn(`\n${line}\n`);
      warn(`Full diagnostics:\n${error.startupFailure.report}`);
    }
    process.exit(1);
  }
  process.stderr.write(`${error.message ?? error}\n`);
  process.exit(1);
}