import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

export function instanceHome(registry, name) {
  const entry = registry.instances[name];
  if (entry === undefined) {
    throw new Error(`nanodsh: instance ${JSON.stringify(name)} is not registered; run "nanodsh instance add ${name} --home <path>"`);
  }
  return expandHome(entry.home);
}

export function namesSharingHome(registry, home) {
  return Object.entries(registry.instances)
    .filter(([, entry]) => expandHome(entry.home) === home)
    .map(([name]) => name);
}
