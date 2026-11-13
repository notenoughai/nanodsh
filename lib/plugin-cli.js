import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { initProfile, readProfilePlugins, reconcileProfilePlugins } from '@deepseek-ai/dsh-app-boot';
import { runPnpm } from './distro.js';
import { resolveInstance } from './instance.js';
import { INSTALL_ANCHOR, NAME } from './profile.js';

const HELP = `Usage: nanodsh plugin --profile <name> <pnpm arguments...>

Manage a profile's packages by forwarding the arguments to pnpm in the profile
directory, then reconcile dsh.profile.bundles from what is installed.

Examples:
  nanodsh plugin --profile work add @deepseek-ai/dsh-headless
  nanodsh plugin --profile work remove @deepseek-ai/dsh-headless

A missing profile is initialized first, with an empty bundle list. --instance and
--home choose the home the profile lives in, as everywhere else.
`;

function takeFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return { value: undefined, rest: argv };
  const value = argv[index + 1];
  const rest = [...argv.slice(0, index), ...argv.slice(index + 2)];
  return { value, rest };
}

function pinHostVersions(args, version) {
  if (version === undefined) return args;
  return args.map((argument) => (argument.startsWith('@deepseek-ai/') && argument.lastIndexOf('@') === 0 ? `${argument}@${version}` : argument));
}

export async function runPluginCli(argv) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const profileFlag = takeFlag(argv, '--profile');
  if (profileFlag.value === undefined || profileFlag.value === '') {
    throw new Error('nanodsh: plugin needs --profile <name>');
  }
  const name = profileFlag.value;
  const withoutSelection = takeFlag(takeFlag(profileFlag.rest, '--instance').rest, '--home').rest;
  if (withoutSelection.length === 0) {
    throw new Error('nanodsh: plugin needs pnpm arguments to forward, for example "add <package>"');
  }
  const home = resolveDshHome();
  const profileDir = join(home, 'profiles', name);
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, []);
    process.stderr.write(`nanodsh: initialized profile ${name} at ${profileDir}\n`);
  }
  const instance = resolveInstance(home);
  const installAnchor = instance?.installAnchor ?? INSTALL_ANCHOR;
  const forwarded = withoutSelection[0] === 'add' ? pinHostVersions(withoutSelection, instance?.bundleVersion) : withoutSelection;
  const location = { binName: NAME, profileDir, installAnchor };
  const before = readProfilePlugins(location);
  await runPnpm(forwarded, profileDir);
  const { plugins, addedPlainDependencies } = reconcileProfilePlugins({ ...location, before, preserveDisabled: true });
  const enabled = plugins.dependencies.filter((dependency) => dependency.enabled).map((dependency) => dependency.name);
  process.stdout.write(`nanodsh: profile ${name} bundles: ${enabled.length === 0 ? '(none)' : enabled.join(', ')}\n`);
  if (addedPlainDependencies.length > 0) {
    process.stdout.write(`nanodsh: installed but not a bundle: ${addedPlainDependencies.join(', ')}\n`);
  }
}
