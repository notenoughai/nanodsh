import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { addDistro } from './distro.js';
import { expandHome, instanceHome, namesSharingHome, readRegistry, writeRegistry } from './registry.js';

const HELP = `Usage: nanodsh instance <command> [options]

Commands:
  list [--json]                 every registered instance
  add <name> [--home <path>] [--distro <pkg>[@version]] [--profile <name>]
  set <name> [--home <path>] [--distro <pkg>[@version]] [--profile <name>]
  show <name>
  default [<name>]              print the default, or set it
  remove <name> [--purge --yes]
  rename <old> <new>

The registry lives in ${'${XDG_CONFIG_HOME:-~/.config}'}/nanodsh/instances.json.
`;

function dataHome(name) {
  const base = process.env.XDG_DATA_HOME !== undefined && process.env.XDG_DATA_HOME.trim() !== ''
    ? process.env.XDG_DATA_HOME
    : join(homedir(), '.local', 'share');
  return join(base, 'nanodsh', 'instances', name);
}

function checkHome(home) {
  if (existsSync(home) && !statSync(home).isDirectory()) throw new Error(`nanodsh: ${home} is not a directory`);
  return home;
}

function checkName(name) {
  if (typeof name !== 'string' || name === '') throw new Error('nanodsh: an instance name is required');
  if (name.includes('/') || /\s/.test(name) || name === '.' || name === '..' || name.startsWith('-')) {
    throw new Error(`nanodsh: ${JSON.stringify(name)} is not a valid instance name`);
  }
}

function selectionOf(home) {
  const file = join(home, 'distro.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function describe(registry, name) {
  const entry = registry.instances[name];
  const home = expandHome(entry.home);
  const selection = selectionOf(home);
  const shared = namesSharingHome(registry, home).filter((other) => other !== name);
  return {
    name,
    home,
    exists: existsSync(home),
    distro: selection?.distro,
    version: selection?.version,
    api: selection?.api,
    profile: entry.profile,
    default: registry.default === name,
    sharedWith: shared,
  };
}

function formatList(rows) {
  const header = ['NAME', 'HOME', 'DISTRO', 'PROFILE', 'STATE'];
  const cells = rows.map((row) => [
    row.name,
    row.home,
    row.distro === undefined ? '-' : `${row.distro}@${row.version}${row.api === undefined ? '' : ` (api ${row.api})`}`,
    row.profile ?? '-',
    row.exists ? (row.sharedWith.length === 0 ? 'ok' : `shared with ${row.sharedWith.join(', ')}`) : 'missing',
  ]);
  const widths = header.map((title, index) => Math.max(title.length, ...cells.map((cell) => cell[index].length)));
  const line = (values) => values.map((value, index) => value.padEnd(widths[index])).join('  ').trimEnd();
  return `${[line(header), ...cells.map(line)].join('\n')}\n`;
}

const VALUE_OPTIONS = new Set(['--home', '--distro', '--profile']);

function parseInstanceArguments(argv) {
  const options = {};
  const flags = new Set();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('-')) {
      positionals.push(token);
      continue;
    }
    const [name, inline] = token.includes('=') ? token.split('=', 2) : [token, undefined];
    if (!VALUE_OPTIONS.has(name)) {
      flags.add(token);
      continue;
    }
    const value = inline === undefined ? argv[index + 1] : inline;
    if (inline === undefined) index += 1;
    if (value === undefined || value === '') throw new Error(`nanodsh: ${name} needs a value`);
    options[name] = value;
  }
  return { positionals, options, flags };
}

export async function runInstanceCli(argv) {
  const [command, ...rest] = argv;
  const registry = readRegistry();
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  const { positionals, options, flags } = parseInstanceArguments(rest);
  if (command === 'list') {
    const rows = Object.keys(registry.instances).map((name) => describe(registry, name));
    if (flags.has('--json')) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    else process.stdout.write(formatList(rows));
    return;
  }
  if (command === 'add') {
    const name = positionals[0];
    checkName(name);
    if (registry.instances[name] !== undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is already registered`);
    const home = checkHome(options['--home'] === undefined ? resolve(dataHome(name)) : resolve(expandHome(options['--home'])));
    const distroSpec = options['--distro'];
    if (distroSpec !== undefined) {
      const added = await addDistro(distroSpec, home);
      registry.instances[name] = { home, distro: `${added.name}@${added.version}` };
    } else {
      registry.instances[name] = { home };
    }
    if (options['--profile'] !== undefined) registry.instances[name].profile = options['--profile'];
    if (registry.default === undefined) registry.default = name;
    writeRegistry(registry);
    process.stdout.write(`nanodsh: instance ${name} registered at ${home}\n`);
    return;
  }
  if (command === 'set') {
    const name = positionals[0];
    checkName(name);
    if (registry.instances[name] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    if (options['--home'] !== undefined) registry.instances[name].home = checkHome(resolve(expandHome(options['--home'])));
    const distroSpec = options['--distro'];
    if (distroSpec !== undefined) {
      const target = expandHome(registry.instances[name].home);
      const added = await addDistro(distroSpec, target);
      registry.instances[name].distro = `${added.name}@${added.version}`;
    }
    if (options['--profile'] !== undefined) registry.instances[name].profile = options['--profile'];
    writeRegistry(registry);
    process.stdout.write(`nanodsh: instance ${name} updated\n`);
    return;
  }
  if (command === 'show') {
    const name = positionals[0];
    checkName(name);
    if (registry.instances[name] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    const row = describe(registry, name);
    const lines = [
      `name      ${row.name}`,
      `home      ${row.home}`,
      `state     ${row.exists ? 'ok' : 'missing'}`,
      `distro    ${row.distro === undefined ? '(none)' : `${row.distro}@${row.version} (api ${row.api})`}`,
      `profile   ${row.profile ?? '(none)'}`,
      `default   ${row.default ? 'yes' : 'no'}`,
    ];
    if (row.sharedWith.length > 0) lines.push(`shared    with ${row.sharedWith.join(', ')}`);
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }
  if (command === 'default') {
    const name = positionals[0];
    if (name === undefined) {
      process.stdout.write(`${registry.default ?? '(none)'}\n`);
      return;
    }
    checkName(name);
    if (registry.instances[name] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    registry.default = name;
    writeRegistry(registry);
    process.stdout.write(`nanodsh: default instance is ${name}\n`);
    return;
  }
  if (command === 'remove') {
    const name = positionals[0];
    checkName(name);
    if (registry.instances[name] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    const home = instanceHome(registry, name);
    const purge = flags.has('--purge');
    if (purge) {
      if (!flags.has('--yes')) throw new Error(`nanodsh: --purge also needs --yes; it deletes ${home}`);
      const others = namesSharingHome(registry, home).filter((other) => other !== name);
      if (others.length > 0) {
        throw new Error(`nanodsh: ${home} is shared with ${others.join(', ')}; remove ${others.length === 1 ? 'that instance' : 'those instances'} first or drop --purge`);
      }
      if (!existsSync(home)) {
        process.stderr.write(`nanodsh: ${home} does not exist; removing the registration only\n`);
      } else {
        const resolved = realpathSync(home);
        if (resolved === '/' || resolved === realpathSync(homedir())) {
          throw new Error(`nanodsh: refusing to delete ${resolved}`);
        }
        if (lstatSync(home).isSymbolicLink()) {
          rmSync(home, { force: true });
          process.stderr.write(`nanodsh: ${home} was a symbolic link; removed the link and left ${resolved} in place\n`);
        } else {
          rmSync(resolved, { recursive: true, force: true });
        }
      }
    }
    delete registry.instances[name];
    if (registry.default === name) {
      const remaining = Object.keys(registry.instances);
      registry.default = remaining.length === 0 ? undefined : remaining[0];
    }
    writeRegistry(registry);
    process.stdout.write(`nanodsh: instance ${name} removed${purge ? ' with its directory' : ''}\n`);
    return;
  }
  if (command === 'rename') {
    const [from, to] = positionals;
    checkName(from);
    checkName(to);
    if (registry.instances[from] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(from)} is not registered`);
    if (registry.instances[to] !== undefined) throw new Error(`nanodsh: instance ${JSON.stringify(to)} is already registered`);
    registry.instances[to] = registry.instances[from];
    delete registry.instances[from];
    if (registry.default === from) registry.default = to;
    writeRegistry(registry);
    process.stdout.write(`nanodsh: instance ${from} renamed to ${to}\n`);
    return;
  }
  throw new Error(`nanodsh: unknown instance command ${JSON.stringify(command)}; expected list, add, set, show, default, remove or rename`);
}
