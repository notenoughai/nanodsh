import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

export async function runInstanceCli(argv) {
  const [command, ...rest] = argv;
  const positional = rest.filter((value) => !value.startsWith('-'));
  const option = (name) => {
    const index = rest.indexOf(name);
    return index === -1 ? undefined : rest[index + 1];
  };
  const registry = readRegistry();
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'list') {
    const rows = Object.keys(registry.instances).map((name) => describe(registry, name));
    if (rest.includes('--json')) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    else process.stdout.write(formatList(rows));
    return;
  }
  if (command === 'add') {
    const name = positional[0];
    checkName(name);
    if (registry.instances[name] !== undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is already registered`);
    const home = option('--home') === undefined ? dataHome(name) : expandHome(option('--home'));
    const distroSpec = option('--distro');
    if (distroSpec !== undefined) {
      const added = await addDistro(distroSpec, home);
      registry.instances[name] = { home, distro: `${added.name}@${added.version}` };
    } else {
      registry.instances[name] = { home };
    }
    const profile = option('--profile');
    if (profile !== undefined) registry.instances[name].profile = profile;
    if (registry.default === undefined) registry.default = name;
    writeRegistry(registry);
    process.stdout.write(`nanodsh: instance ${name} registered at ${home}\n`);
    return;
  }
  if (command === 'set') {
    const name = positional[0];
    checkName(name);
    if (registry.instances[name] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    const home = option('--home');
    if (home !== undefined) registry.instances[name].home = expandHome(home);
    const distroSpec = option('--distro');
    if (distroSpec !== undefined) {
      const target = expandHome(registry.instances[name].home);
      const added = await addDistro(distroSpec, target);
      registry.instances[name].distro = `${added.name}@${added.version}`;
    }
    const profile = option('--profile');
    if (profile !== undefined) registry.instances[name].profile = profile;
    writeRegistry(registry);
    process.stdout.write(`nanodsh: instance ${name} updated\n`);
    return;
  }
  if (command === 'show') {
    const name = positional[0];
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
    const name = positional[0];
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
    const name = positional[0];
    checkName(name);
    if (registry.instances[name] === undefined) throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    const home = instanceHome(registry, name);
    const purge = rest.includes('--purge');
    if (purge) {
      if (!rest.includes('--yes')) throw new Error(`nanodsh: --purge also needs --yes; it deletes ${home}`);
      if (!existsSync(home)) {
        process.stderr.write(`nanodsh: ${home} does not exist; removing the registration only\n`);
      } else {
        const resolved = realpathSync(home);
        if (resolved === '/' || resolved === realpathSync(homedir())) {
          throw new Error(`nanodsh: refusing to delete ${resolved}`);
        }
        rmSync(resolved, { recursive: true, force: true });
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
    const [from, to] = positional;
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
