import { createProfile, listProfiles, removeProfile } from '@nanodsh/core';

const HELP = `Usage: nanodsh profile <command> [options]

Commands:
  list                          profiles in the current instance
  create <name> [--bundle <pkg>]...
                                create a profile; bundles default to the distro's
  remove <name> --yes           delete a profile directory

A name that matches a subcommand is accepted with a warning: it can only be booted
as --profile <name>. A name that matches a shipped template is accepted with a
warning too, since that name initialises from the template on first boot.
`;

function parseProfileArguments(argv) {
  const options = { bundles: [] };
  const flags = new Set();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const [name, inline] = token.includes('=') ? token.split('=', 2) : [token, undefined];
    if (name === '--bundle' || name === '--home' || name === '--instance') {
      const value = inline === undefined ? argv[index + 1] : inline;
      if (inline === undefined) index += 1;
      if (value === undefined || value === '') throw new Error(`nanodsh: ${name} needs a value`);
      if (name === '--bundle') options.bundles.push(value);
      else options[name] = value;
      continue;
    }
    flags.add(token);
  }
  return { positionals, options, flags };
}

export function runProfileCli(argv, { home }) {
  const [command, ...rest] = argv;
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'list') {
    const listing = listProfiles({ home });
    if (listing.profiles.length === 0) {
      process.stdout.write(`no profiles in ${listing.dir}\n`);
      return;
    }
    for (const entry of listing.profiles) {
      const bundles = entry.bundles.length === 0 ? '(no bundles)' : entry.bundles.join(', ');
      process.stdout.write(`${entry.name}${entry.shipped ? ' (shipped template)' : ''}  ${bundles}\n`);
    }
    return;
  }
  const { positionals, options, flags } = parseProfileArguments(rest);
  if (command === 'create') {
    const created = createProfile({ home, name: positionals[0], bundles: options.bundles });
    for (const notice of created.notices) process.stderr.write(`${notice}\n`);
    process.stdout.write(
      `nanodsh: profile ${created.name} created at ${created.dir}${created.bundles.length === 0 ? '' : ` with ${created.bundles.join(', ')}`}\n`,
    );
    return;
  }
  if (command === 'remove') {
    const removed = removeProfile({ home, name: positionals[0], confirmed: flags.has('--yes') });
    for (const notice of removed.notices) process.stderr.write(`${notice}\n`);
    process.stdout.write(`nanodsh: profile ${removed.name} removed\n`);
    return;
  }
  throw new Error(`nanodsh: unknown profile command ${JSON.stringify(command)}; expected list, create or remove`);
}