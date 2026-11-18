import {
  createInstance,
  instanceHome,
  readRegistry,
  defaultInstance,
  listInstances,
  removeInstance,
  renameInstance,
  setDefaultInstance,
  setInstance,
  showInstance,
} from '@nanodsh/core';

const HELP = `Usage: nanodsh instance <command> [options]

Commands:
  list [--json]                 every registered instance
  create <name> [--home <path>] [--distro <pkg>[@version]] [--profile <name>]
                                make the home, then register it
  set <name> [--home <path>] [--distro <pkg>[@version]] [--profile <name>]
  show <name>
  default [<name>]              print the default, or set it
  remove <name> [--purge --yes]
  rename <old> <new>

The registry lives in ${'${XDG_CONFIG_HOME:-~/.config}'}/nanodsh/instances.json.
`;

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

function formatShow(row) {
  const lines = [
    `name      ${row.name}`,
    `home      ${row.home}`,
    `state     ${row.exists ? 'ok' : 'missing'}`,
    `distro    ${row.distro === undefined ? '(none)' : `${row.distro}@${row.version} (api ${row.api})`}`,
    `profile   ${row.profile ?? '(none)'}`,
    `default   ${row.default ? 'yes' : 'no'}`,
  ];
  if (row.sharedWith.length > 0) lines.push(`shared    with ${row.sharedWith.join(', ')}`);
  return `${lines.join('\n')}\n`;
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

export async function runInstanceCli(argv, { env = process.env } = {}) {
  const [command, ...rest] = argv;
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  const { positionals, options, flags } = parseInstanceArguments(rest);
  if (command === 'list') {
    const rows = listInstances({ env });
    if (flags.has('--json')) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    else process.stdout.write(formatList(rows));
    return;
  }
  if (command === 'create' || command === 'add') {
    const name = positionals[0];
    const created = await createInstance({
      name,
      home: options['--home'],
      profile: options['--profile'],
      distro: options['--distro'],
      env,
    });
    process.stdout.write(`nanodsh: instance ${created.name} created at ${created.home}\n`);
    return;
  }
  if (command === 'set') {
    const updated = await setInstance({
      name: positionals[0],
      home: options['--home'],
      profile: options['--profile'],
      distro: options['--distro'],
      env,
    });
    process.stdout.write(`nanodsh: instance ${updated.name} updated\n`);
    return;
  }
  if (command === 'show') {
    process.stdout.write(formatShow(showInstance({ name: positionals[0], env })));
    return;
  }
  if (command === 'default') {
    const name = positionals[0];
    if (name === undefined) {
      process.stdout.write(`${defaultInstance({ env }) ?? '(none)'}\n`);
      return;
    }
    setDefaultInstance({ name, env });
    process.stdout.write(`nanodsh: default instance is ${name}\n`);
    return;
  }
  if (command === 'remove') {
    const name = positionals[0];
    const purge = flags.has('--purge');
    if (purge) {
      const current = readRegistry(env);
      if (current.instances[name] === undefined) {
        throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
      }
      if (!flags.has('--yes')) {
        throw new Error(`nanodsh: --purge also needs --yes; it deletes ${instanceHome(current, name)}`);
      }
    }
    const removed = removeInstance({ name, purge, env });
    for (const notice of removed.notices) process.stderr.write(`${notice}\n`);
    process.stdout.write(`nanodsh: instance ${removed.name} removed${removed.purged ? ' with its directory' : ''}\n`);
    return;
  }
  if (command === 'rename') {
    const [from, to] = positionals;
    renameInstance({ from, to, env });
    process.stdout.write(`nanodsh: instance ${from} renamed to ${to}\n`);
    return;
  }
  throw new Error(`nanodsh: unknown instance command ${JSON.stringify(command)}; expected list, add, set, show, default, remove or rename`);
}