import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SUPPORTED_DISTRO_API } from './instance.js';

const PREFIX = 'nanodsh';
const WORKSPACE = `packages:
  - profiles/*

nodeLinker: hoisted
autoInstallPeers: true
`;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function workspaceFile(home) {
  return join(home, 'pnpm-workspace.yaml');
}

function manifestFile(home) {
  return join(home, 'package.json');
}

function selectionFile(home) {
  return join(home, 'distro.json');
}

function checkInstanceDirectory(home) {
  if (existsSync(manifestFile(home))) {
    const manifest = readJson(manifestFile(home));
    if (manifest.name !== 'dsh-instance') {
      throw new Error(`${PREFIX}: ${home} is not an instance; its package.json is named ${JSON.stringify(manifest.name)}; use an empty directory or an existing instance`);
    }
    return;
  }
  if (existsSync(home) && readdirSync(home).length > 0) {
    throw new Error(`${PREFIX}: ${home} is not empty and holds no instance; use an empty directory or an existing instance`);
  }
}

export function prepareHome(home) {
  checkInstanceDirectory(home);
  mkdirSync(join(home, 'profiles'), { recursive: true });
  if (!existsSync(manifestFile(home))) {
    writeJson(manifestFile(home), { name: 'dsh-instance', private: true, type: 'module', dependencies: {} });
  }
  if (!existsSync(workspaceFile(home))) writeFileSync(workspaceFile(home), WORKSPACE);
}

function allowBuildList(manifest) {
  const allow = manifest?.dsh?.distro?.allowBuilds;
  return Array.isArray(allow) ? allow.map((name) => `--allow-build=${name}`) : [];
}

function localManifest(spec) {
  const path = spec.startsWith('file:') ? spec.slice('file:'.length) : spec.startsWith('/') ? spec : undefined;
  if (path === undefined) return undefined;
  const manifestPath = join(path, 'package.json');
  return existsSync(manifestPath) ? readJson(manifestPath) : undefined;
}

function registryManifest(spec) {
  const view = spawnSync('pnpm', ['view', spec, '--json'], { encoding: 'utf8' });
  if (view.error !== undefined || view.status !== 0) return undefined;
  try {
    const parsed = JSON.parse(view.stdout);
    return Array.isArray(parsed) ? parsed.at(-1) : parsed;
  } catch {
    return undefined;
  }
}

function registrySpec(spec) {
  if (spec.startsWith('/') || spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('~')) return false;
  return !/^(?:file:|link:|workspace:|https?:|git\+|git:|github:|npm:)/.test(spec);
}

async function allowBuildArgs(spec, warn) {
  const local = localManifest(spec);
  if (local !== undefined) return allowBuildList(local);
  if (!registrySpec(spec)) return [];
  const manifest = registryManifest(spec);
  if (manifest === undefined) {
    warn?.(`${PREFIX}: could not read ${spec} from the registry; installing without its allowBuilds\n`);
    return [];
  }
  return allowBuildList(manifest);
}

export function runPnpm(args, directory) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { cwd: directory, stdio: 'inherit' });
    child.on('error', (error) => {
      if (error.code === 'ENOENT') reject(new Error(`${PREFIX}: pnpm was not found on PATH; install it with "corepack enable pnpm" or from https://pnpm.io`));
      else reject(error);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${PREFIX}: pnpm ${args.join(' ')} exited ${code}; if pnpm reported ignored build scripts, run "pnpm approve-builds --all" in ${directory} and retry, or declare them in the distro's dsh.distro.allowBuilds`));
    });
  });
}

function distroManifest(home, name) {
  const file = join(home, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(file)) throw new Error(`${PREFIX}: ${JSON.stringify(name)} is not installed under ${join(home, 'node_modules')}`);
  return readJson(file);
}

export function findDistro(home) {
  const manifest = readJson(manifestFile(home));
  const found = [];
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    const file = join(home, 'node_modules', ...name.split('/'), 'package.json');
    if (!existsSync(file)) continue;
    const candidate = readJson(file);
    if (candidate.dsh?.distro !== undefined) found.push({ name, manifest: candidate });
  }
  if (found.length === 0) {
    throw new Error(`${PREFIX}: no installed dependency declares dsh.distro; the package is not a distro`);
  }
  if (found.length > 1) {
    throw new Error(`${PREFIX}: several installed dependencies declare dsh.distro (${found.map((entry) => entry.name).join(', ')}); an instance holds one`);
  }
  return found[0];
}

export function checkApi(name, manifest) {
  const api = manifest.dsh.distro.api;
  if (api !== SUPPORTED_DISTRO_API) {
    throw new Error(`${PREFIX}: distro ${name}${manifest.version === undefined ? '' : `@${manifest.version}`} declares api ${JSON.stringify(api)} but this launcher supports ${SUPPORTED_DISTRO_API}`);
  }
  return api;
}

function writeSelection(home, name, manifest, api) {
  const file = selectionFile(home);
  const staging = `${file}.staging-${process.pid}`;
  writeFileSync(staging, `${JSON.stringify({ distro: name, version: manifest.version, api }, null, 2)}\n`);
  renameSync(staging, file);
}

function installInto(staging, home, backup, action) {
  const moved = [];
  const move = (from, to) => {
    if (!existsSync(from)) return;
    renameSync(from, to);
    moved.push([from, to]);
  };
  try {
    for (const entry of ['package.json', 'pnpm-lock.yaml']) move(join(home, entry), join(backup, entry));
    move(join(home, 'node_modules'), join(backup, 'node_modules'));
    move(join(staging, 'package.json'), join(home, 'package.json'));
    move(join(staging, 'pnpm-lock.yaml'), join(home, 'pnpm-lock.yaml'));
    move(join(staging, 'node_modules'), join(home, 'node_modules'));
  } catch (error) {
    let restored = true;
    for (const [from, to] of moved.reverse()) {
      try {
        renameSync(to, from);
      } catch {
        restored = false;
      }
    }
    if (restored) throw new Error(`${PREFIX}: ${action} failed; ${home} was left unchanged`, { cause: error });
    const failure = new Error(`${PREFIX}: ${action} failed and ${home} may need repair; the previous tree is in ${backup}`, { cause: error });
    failure.keepStaging = true;
    throw failure;
  }
}

export async function addDistro(spec, home, { warn } = {}) {
  if (typeof spec !== 'string' || spec === '') throw new Error(`${PREFIX}: distro add needs a package, for example "@nanodsh/distro-standard@0.0.1"`);
  const createdHome = !existsSync(home);
  prepareHome(home);
  if (existsSync(selectionFile(home))) {
    const selection = readJson(selectionFile(home));
    throw new Error(`${PREFIX}: ${home} already selects ${selection.distro}@${selection.version}; run "nanodsh distro switch <package>" to replace it`);
  }
  const staging = mkdtempSync(join(dirname(join(home, 'x')), '.distro-staging-'));
  const backup = `${staging}/previous`;
  let keepStaging = false;
  let keepHome = false;
  try {
    writeJson(join(staging, 'package.json'), { name: 'dsh-instance', private: true, type: 'module', dependencies: {} });
    writeFileSync(join(staging, 'pnpm-workspace.yaml'), WORKSPACE);
    mkdirSync(join(staging, 'profiles'), { recursive: true });
    await runPnpm(['add', ...(await allowBuildArgs(spec, warn)), spec], staging);
    const { name, manifest } = findDistro(staging);
    const api = checkApi(name, manifest);
    mkdirSync(backup, { recursive: true });
    try {
      installInto(staging, home, backup, 'distro add');
    } catch (error) {
      if (error.keepStaging === true) {
        keepStaging = true;
        keepHome = true;
      }
      throw error;
    }
    writeSelection(home, name, manifest, api);
    return { name, version: manifest.version, api };
  } catch (error) {
    if (createdHome && !keepHome) rmSync(home, { recursive: true, force: true });
    throw error;
  } finally {
    if (!keepStaging) rmSync(staging, { recursive: true, force: true });
  }
}

export async function switchDistro(spec, home, { warn } = {}) {
  if (typeof spec !== 'string' || spec === '') throw new Error(`${PREFIX}: distro switch needs a package`);
  if (!existsSync(manifestFile(home))) {
    throw new Error(`${PREFIX}: ${home} holds no instance; run "nanodsh distro add ${spec}" to create one`);
  }
  const staging = mkdtempSync(join(dirname(join(home, 'x')), '.distro-staging-'));
  const backup = `${staging}/previous`;
  let keepStaging = false;
  try {
    writeJson(join(staging, 'package.json'), { name: 'dsh-instance', private: true, type: 'module', dependencies: {} });
    writeFileSync(join(staging, 'pnpm-workspace.yaml'), WORKSPACE);
    mkdirSync(join(staging, 'profiles'), { recursive: true });
    await runPnpm(['add', ...(await allowBuildArgs(spec, warn)), spec], staging);
    const { name, manifest } = findDistro(staging);
    const api = checkApi(name, manifest);
    const selection = { distro: name, version: manifest.version, api };
    mkdirSync(backup, { recursive: true });
    try {
      installInto(staging, home, backup, 'distro switch');
    } catch (error) {
      if (error.keepStaging === true) keepStaging = true;
      throw error;
    }
    writeSelection(home, name, manifest, api);
    return { name, version: manifest.version, api };
  } finally {
    if (!keepStaging) rmSync(staging, { recursive: true, force: true });
  }
}

export function showDistro(home) {
  if (!existsSync(selectionFile(home))) {
    throw new Error(`${PREFIX}: ${home} has no distro selection; run "nanodsh distro add <package>"`);
  }
  const selection = readJson(selectionFile(home));
  const manifest = distroManifest(home, selection.distro);
  const api = checkApi(selection.distro, manifest);
  const declared = Object.keys(manifest.dependencies ?? {});
  const installed = declared.filter((name) => existsSync(join(home, 'node_modules', ...name.split('/'), 'package.json'))).length;
  return {
    distro: selection.distro,
    version: manifest.version,
    api,
    defaultBundles: manifest.dsh.distro.defaultBundles ?? [],
    declaredHosts: declared.length,
    installedHosts: installed,
    home,
  };
}
