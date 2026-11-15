import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const VERSION = 1;

export function registryFile(env = process.env) {
  const configured = env.XDG_CONFIG_HOME;
  const base = configured !== undefined && configured.trim() !== '' ? configured : join(homedir(), '.config');
  return join(base, 'nanodsh', 'instances.json');
}

export function expandHome(path) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

export function readRegistry(env = process.env) {
  const file = registryFile(env);
  if (!existsSync(file)) return { version: VERSION, instances: {} };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`nanodsh: ${file} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (parsed.version !== VERSION) {
    throw new Error(`nanodsh: ${file} is version ${JSON.stringify(parsed.version)}; this launcher understands version ${VERSION}`);
  }
  return { version: VERSION, default: parsed.default, instances: parsed.instances ?? {} };
}

export function writeRegistry(registry, env = process.env) {
  const file = registryFile(env);
  mkdirSync(dirname(file), { recursive: true });
  const staging = `${file}.staging-${process.pid}`;
  const document = { version: VERSION, ...(registry.default === undefined ? {} : { default: registry.default }), instances: registry.instances };
  writeFileSync(staging, `${JSON.stringify(document, null, 2)}\n`);
  renameSync(staging, file);
}

const LOCK_TIMEOUT_MS = 10000;
const STALE_LOCK_MS = 30000;

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function acquireLock(file) {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(lock);
      return () => rmSync(lock, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`nanodsh: ${file} is locked by another process; remove ${lock} if no other nanodsh is running`);
      }
      sleep(10 + Math.floor(Math.random() * 20));
    }
  }
}

export function updateRegistry(mutate, env = process.env) {
  const file = registryFile(env);
  mkdirSync(dirname(file), { recursive: true });
  const release = acquireLock(file);
  try {
    const registry = readRegistry(env);
    const result = mutate(registry);
    writeRegistry(registry, env);
    return result;
  } finally {
    release();
  }
}

export function resolvedHome(path) {
  const expanded = expandHome(path);
  try {
    return realpathSync(expanded);
  } catch {
    return resolve(expanded);
  }
}

export function instanceHome(registry, name) {
  const entry = registry.instances[name];
  if (entry === undefined) {
    throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered; run "nanodsh instance add ${name} --home <path>"`);
  }
  return expandHome(entry.home);
}

export function namesSharingHome(registry, home) {
  const target = resolvedHome(home);
  return Object.entries(registry.instances)
    .filter(([, entry]) => resolvedHome(entry.home) === target)
    .map(([name]) => name);
}
