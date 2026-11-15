import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { initProfile } from '@deepseek-ai/dsh-app-boot';
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles';
import { resolveInstance } from './instance.js';
import { isProfileName } from './names.js';

const RESERVED = ['plugin', 'distro', 'instance', 'completion'];

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

function profilesDir(home) {
  return join(home, 'profiles');
}

function bundlesOf(profile) {
  try {
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
    return Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
  } catch {
    return [];
  }
}

function optionValues(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1] !== undefined) values.push(argv[index + 1]);
  }
  return values;
}

function positional(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith('--')) {
      if (argv[index] === '--bundle') index += 1;
      continue;
    }
    values.push(argv[index]);
  }
  return values;
}

export function runProfileCli(argv) {
  const [command, ...rest] = argv;
  const home = resolveDshHome();
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'list') {
    const dir = profilesDir(home);
    const names = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort()
      : [];
    if (names.length === 0) {
      process.stdout.write(`no profiles in ${dir}\n`);
      return;
    }
    for (const name of names) {
      const bundles = bundlesOf(join(dir, name));
      const template = Object.hasOwn(PROFILE_TEMPLATES, name) ? ' (shipped template)' : '';
      process.stdout.write(`${name}${template}  ${bundles.length === 0 ? '(no bundles)' : bundles.join(', ')}\n`);
    }
    return;
  }
  if (command === 'create') {
    const name = positional(rest)[0];
    if (!isProfileName(name)) throw new Error(`nanodsh: ${JSON.stringify(name)} is not a valid profile name`);
    if (RESERVED.includes(name.toLowerCase())) {
      process.stderr.write(`nanodsh: ${JSON.stringify(name)} is also a subcommand name; boot it with --profile ${name}\n`);
    }
    if (Object.hasOwn(PROFILE_TEMPLATES, name)) {
      process.stderr.write(`nanodsh: ${JSON.stringify(name)} names a shipped template; a profile of this name would otherwise initialise from it\n`);
    }
    const dir = join(profilesDir(home), name);
    if (existsSync(dir)) throw new Error(`nanodsh: profile ${JSON.stringify(name)} already exists at ${dir}`);
    const requested = optionValues(rest, '--bundle');
    const bundles = requested.length > 0 ? requested : resolveInstance(home)?.defaultBundles ?? [];
    initProfile(dir, bundles);
    process.stdout.write(`nanodsh: profile ${name} created at ${dir}${bundles.length === 0 ? '' : ` with ${bundles.join(', ')}`}\n`);
    return;
  }
  if (command === 'remove') {
    const name = positional(rest)[0];
    if (!isProfileName(name)) throw new Error(`nanodsh: ${JSON.stringify(name)} is not a valid profile name`);
    const dir = join(profilesDir(home), name);
    if (!existsSync(dir)) throw new Error(`nanodsh: profile ${JSON.stringify(name)} does not exist at ${dir}`);
    if (!rest.includes('--yes')) throw new Error(`nanodsh: removing a profile deletes ${dir}; pass --yes to confirm`);
    const resolved = realpathSync(dir);
    if (resolved === '/' || resolved === realpathSync(homedir())) throw new Error(`nanodsh: refusing to delete ${resolved}`);
    if (lstatSync(dir).isSymbolicLink()) {
      rmSync(dir, { force: true });
      process.stderr.write(`nanodsh: ${dir} was a symbolic link; removed the link and left ${resolved} in place\n`);
    } else {
      rmSync(resolved, { recursive: true, force: true });
    }
    process.stdout.write(`nanodsh: profile ${name} removed\n`);
    return;
  }
  throw new Error(`nanodsh: unknown profile command ${JSON.stringify(command)}; expected list, create or remove`);
}
