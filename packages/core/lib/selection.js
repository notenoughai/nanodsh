import { expandHome, instanceHome, readRegistry } from './registry.js';

const VALUE_FLAGS = new Set(['--instance', '--home', '--profile', '--patch', '--from-default-profile']);

export function selectionFlags(argv, { stopAtPositional = true } = {}) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') break;
    if (!token.startsWith('-')) {
      if (stopAtPositional) break;
      continue;
    }
    const [name, inline] = token.includes('=') ? token.split('=', 2) : [token, undefined];
    if (!VALUE_FLAGS.has(name)) continue;
    const value = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
    if (name === '--instance') flags.instance = value;
    else if (name === '--home') flags.home = value;
  }
  return flags;
}

export function withoutSelectionFlags(argv) {
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [name, inline] = token.includes('=') ? token.split('=', 2) : [token, undefined];
    if (name === '--home' || name === '--instance') {
      if (inline === undefined) index += 1;
      continue;
    }
    rest.push(token);
  }
  return rest;
}

export function selectHome(argv, env, options = {}) {
  const flags = selectionFlags(argv, options);
  if (flags.home !== undefined && flags.instance !== undefined) {
    throw new Error('nanodsh: --instance and --home are mutually exclusive');
  }
  if (flags.home !== undefined && flags.home !== '') return { home: expandHome(flags.home), source: 'flag:--home' };
  if (flags.home === '') throw new Error('nanodsh: --home needs a path');
  if (flags.instance !== undefined) {
    if (flags.instance === '') throw new Error('nanodsh: --instance needs a name');
    const registry = readRegistry(env);
    return { home: instanceHome(registry, flags.instance), source: 'flag:--instance', name: flags.instance, profile: registry.instances[flags.instance].profile };
  }
  if (env.NANODSH_INSTANCE !== undefined && env.NANODSH_INSTANCE.trim() !== '') {
    const registry = readRegistry(env);
    const name = env.NANODSH_INSTANCE.trim();
    return { home: instanceHome(registry, name), source: 'env:NANODSH_INSTANCE', name, profile: registry.instances[name].profile };
  }
  if (env.DSH_HOME !== undefined && env.DSH_HOME.trim() !== '') {
    return { home: env.DSH_HOME, source: 'env:DSH_HOME' };
  }
  const registry = readRegistry(env);
  if (registry.default !== undefined) {
    const name = registry.default;
    return { home: instanceHome(registry, name), source: 'registry:default', name, profile: registry.instances[name].profile };
  }
  throw new Error(
    'nanodsh: no instance selected\n'
    + '  pass --home <path> or --instance <name>, or create one:\n'
    + '  nanodsh instance create default --home ~/dsh --distro <package>'
  );
}

export function overriddenNotice(selection, env) {
  if (selection.source !== 'flag:--instance' && selection.source !== 'flag:--home') return '';
  if (env.DSH_HOME === undefined || env.DSH_HOME.trim() === '') return '';
  if (expandHome(env.DSH_HOME) === expandHome(selection.home)) return '';
  return `nanodsh: using ${selection.home} for this run; DSH_HOME is set to ${env.DSH_HOME} and is overridden\n`;
}
