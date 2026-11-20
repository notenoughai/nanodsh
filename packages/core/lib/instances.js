import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { addDistro } from './distro.js';
import { expandHome, instanceHome, namesSharingHome, readRegistry, updateRegistry } from './registry.js';

function dataHome(name, env) {
  const configured = env.XDG_DATA_HOME;
  const base = configured !== undefined && configured.trim() !== '' ? configured : join(homedir(), '.local', 'share');
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
  return name;
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

/** Every registered instance, as plain rows for a caller to render. */
export function listInstances({ env }) {
  const registry = readRegistry(env);
  return Object.keys(registry.instances).map((name) => describe(registry, name));
}

/** One registered instance, or an error naming the command that registers it. */
export function showInstance({ name, env }) {
  const registry = readRegistry(env);
  if (registry.instances[name] === undefined) {
    throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
  }
  return describe(registry, name);
}

/** The default instance name, or undefined when none is set. */
export function defaultInstance({ env }) {
  return readRegistry(env).default;
}

const INSTANCE_ENTRIES = ['distro.json', 'node_modules', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'profiles'];

function discardHome(target, existed, empty) {
  if (!existed) {
    rmSync(target, { recursive: true, force: true });
    return;
  }
  if (!empty) return;
  for (const entry of INSTANCE_ENTRIES) rmSync(join(target, entry), { recursive: true, force: true });
}

/** Creates the home directory and registers it; an optional distro is installed first. */
export async function createInstance({ name, home, profile, distro: distroSpec, env }) {
  checkName(name);
  if (readRegistry(env).instances[name] !== undefined) {
    throw new Error(`nanodsh: instance ${JSON.stringify(name)} is already registered`);
  }
  const target = checkHome(home === undefined ? resolve(dataHome(name, env)) : resolve(expandHome(home)));
  const existed = existsSync(target);
  const empty = existed && readdirSync(target).length === 0;
  let distro;
  mkdirSync(target, { recursive: true });
  try {
    if (distroSpec !== undefined) {
      const added = await addDistro(distroSpec, target);
      distro = `${added.name}@${added.version}`;
    }
    updateRegistry((registry) => {
      if (registry.instances[name] !== undefined) {
        throw new Error(`nanodsh: instance ${JSON.stringify(name)} is already registered`);
      }
      registry.instances[name] = distro === undefined ? { home: target } : { home: target, distro };
      if (profile !== undefined) registry.instances[name].profile = profile;
      if (registry.default === undefined) registry.default = name;
    }, env);
  } catch (error) {
    discardHome(target, existed, empty);
    throw error;
  }
  return { name, home: target };
}

/** Updates the home, distro or profile of a registered instance. */
export async function setInstance({ name, home, profile, distro: distroSpec, env }) {
  checkName(name);
  const current = readRegistry(env);
  if (current.instances[name] === undefined) {
    throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
  }
  let distro;
  if (distroSpec !== undefined) {
    const added = await addDistro(distroSpec, expandHome(current.instances[name].home));
    distro = `${added.name}@${added.version}`;
  }
  updateRegistry((registry) => {
    if (registry.instances[name] === undefined) {
      throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    }
    if (home !== undefined) registry.instances[name].home = checkHome(resolve(expandHome(home)));
    if (distro !== undefined) registry.instances[name].distro = distro;
    if (profile !== undefined) registry.instances[name].profile = profile;
  }, env);
  return { name };
}

/** Points the default at a registered instance. */
export function setDefaultInstance({ name, env }) {
  checkName(name);
  updateRegistry((registry) => {
    if (registry.instances[name] === undefined) {
      throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    }
    registry.default = name;
  }, env);
  return { name };
}

/** Drops a registration, and the home with it when purged; notices report what was left in place. */
export function removeInstance({ name, purge = false, env }) {
  checkName(name);
  const current = readRegistry(env);
  if (current.instances[name] === undefined) {
    throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
  }
  const notices = [];
  if (purge) {
    const home = instanceHome(current, name);
    const others = namesSharingHome(current, home).filter((other) => other !== name);
    if (others.length > 0) {
      throw new Error(`nanodsh: ${home} is shared with ${others.join(', ')}; remove ${others.length === 1 ? 'that instance' : 'those instances'} first or drop --purge`);
    }
    if (!existsSync(home)) {
      notices.push(`nanodsh: ${home} does not exist; removing the registration only`);
    } else {
      const resolved = realpathSync(home);
      if (resolved === '/' || resolved === realpathSync(homedir())) {
        throw new Error(`nanodsh: refusing to delete ${resolved}`);
      }
      if (lstatSync(home).isSymbolicLink()) {
        rmSync(home, { force: true });
        notices.push(`nanodsh: ${home} was a symbolic link; removed the link and left ${resolved} in place`);
      } else {
        rmSync(resolved, { recursive: true, force: true });
      }
    }
  }
  updateRegistry((registry) => {
    if (registry.instances[name] === undefined) {
      throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered`);
    }
    delete registry.instances[name];
    if (registry.default === name) {
      const remaining = Object.keys(registry.instances);
      registry.default = remaining.length === 0 ? undefined : remaining[0];
    }
  }, env);
  return { name, purged: purge, notices };
}

/** Renames a registration, keeping its home and profile. */
export function renameInstance({ from, to, env }) {
  checkName(from);
  checkName(to);
  updateRegistry((registry) => {
    if (registry.instances[from] === undefined) {
      throw new Error(`nanodsh: instance ${JSON.stringify(from)} is not registered`);
    }
    if (registry.instances[to] !== undefined) {
      throw new Error(`nanodsh: instance ${JSON.stringify(to)} is already registered`);
    }
    registry.instances[to] = registry.instances[from];
    delete registry.instances[from];
    if (registry.default === from) registry.default = to;
  }, env);
  return { from, to };
}