import { runPluginCommand } from '@nanodsh/core';

const HELP = `Usage: nanodsh plugin --profile <name> <pnpm arguments...>

Manage a profile's packages by forwarding the arguments to pnpm in the profile
directory, then reconcile dsh.profile.bundles from what is installed.

Examples:
  nanodsh plugin --profile work add @deepseek-ai/dsh-headless
  nanodsh plugin --profile work add --plain @scope/tool
  nanodsh plugin --profile work remove @deepseek-ai/dsh-headless

A missing profile is initialized first, with the distro's default bundles.
--instance and --home choose the home the profile lives in, as everywhere else.
`;

function takeFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return { value: undefined, rest: argv };
  const value = argv[index + 1];
  const rest = [...argv.slice(0, index), ...argv.slice(index + 2)];
  return { value, rest };
}

export async function runPluginCli(argv, { home }) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  const profileFlag = takeFlag(argv, '--profile');
  if (profileFlag.value === undefined || profileFlag.value === '') {
    throw new Error('nanodsh: plugin needs --profile <name>');
  }
  const withoutSelection = takeFlag(takeFlag(profileFlag.rest, '--instance').rest, '--home').rest;
  const result = await runPluginCommand({ home, profile: profileFlag.value, args: withoutSelection });
  for (const notice of result.notices) process.stderr.write(`${notice}\n`);
  const bundles = result.enabled.length === 0 ? '(none)' : result.enabled.join(', ');
  process.stdout.write(`nanodsh: profile ${result.profile} bundles: ${bundles}\n`);
  if (result.plain) {
    process.stdout.write('nanodsh: installed without composing\n');
  } else if (result.addedPlainDependencies.length > 0) {
    process.stdout.write(`nanodsh: installed but not a bundle: ${result.addedPlainDependencies.join(', ')}\n`);
  }
}
