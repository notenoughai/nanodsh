import { spawn } from 'node:child_process';
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

export function prepareHome(home) {
  mkdirSync(join(home, 'profiles'), { recursive: true });
  if (!existsSync(manifestFile(home))) {
    writeJson(manifestFile(home), { name: 'dsh-instance', private: true, type: 'module', dependencies: {} });
  }
  if (!existsSync(workspaceFile(home))) writeFileSync(workspaceFile(home), WORKSPACE);
}

function allowBuildArgs(spec) {
  const path = spec.startsWith('file:') ? spec.slice('file:'.length) : spec.startsWith('/') ? spec : undefined;
  if (path === undefined) return [];
  const manifestPath = join(path, 'package.json');
  if (!existsSync(manifestPath)) return [];
  const allow = readJson(manifestPath).dsh?.distro?.allowBuilds;
  if (!Array.isArray(allow)) return [];
  return allow.map((name) => `--allow-build=${name}`);
}

function runPnpm(args, directory) {
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
      reject(new Error(`${PREFIX}: pnpm ${args.join(' ')} exited ${code}; if pnpm blocked build scripts, run "pnpm approve-builds --all" in ${directory} and retry, or declare them in the distro's dsh.distro.allowBuilds`));
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

export async function addDistro(spec, home) {
  if (typeof spec !== 'string' || spec === '') throw new Error(`${PREFIX}: distro add needs a package, for example "@notenoughai/distro-standard@0.0.1"`);
  prepareHome(home);
  await runPnpm(['add', ...allowBuildArgs(spec), spec], home);
  const { name, manifest } = findDistro(home);
  const api = checkApi(name, manifest);
  writeSelection(home, name, manifest, api);
  return { name, version: manifest.version, api };
}

export async function switchDistro(spec, home) {
  if (typeof spec !== 'string' || spec === '') throw new Error(`${PREFIX}: distro switch needs a package`);
  if (!existsSync(manifestFile(home))) {
    throw new Error(`${PREFIX}: ${home} holds no instance; run "nanodsh distro add ${spec}" to create one`);
  }
  const staging = mkdtempSync(join(dirname(join(home, 'x')), '.distro-staging-'));
  const backup = `${staging}/previous`;
  try {
    writeJson(join(staging, 'package.json'), { name: 'dsh-instance', private: true, type: 'module', dependencies: {} });
    writeFileSync(join(staging, 'pnpm-workspace.yaml'), WORKSPACE);
    mkdirSync(join(staging, 'profiles'), { recursive: true });
    await runPnpm(['add', ...allowBuildArgs(spec), spec], staging);
    const { name, manifest } = findDistro(staging);
    const api = checkApi(name, manifest);
    const selection = { distro: name, version: manifest.version, api };
    mkdirSync(backup, { recursive: true });
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
      for (const [from, to] of moved.reverse()) {
        try {
          renameSync(from, to);
        } catch {
          // a failed restore leaves the backup directory named in the error below
        }
      }
      throw new Error(`${PREFIX}: distro switch failed and ${home} may need repair; the previous tree is in ${backup}`, { cause: error });
    }
    writeSelection(home, name, manifest, api);
    return { name, version: manifest.version, api };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function showDistro(home) {
  if (!existsSync(selectionFile(home))) {
    throw new Error(`${PREFIX}: ${home} has no distro selection; run "nanodsh distro add <package>"`);
  }
  const selection = readJson(selectionFile(home));
  const manifest = distroManifest(home, selection.distro);
  const api = checkApi(selection.distro, manifest);
  const hosts = Object.keys(manifest.dependencies ?? {}).length;
  const installed = existsSync(join(home, 'node_modules'))
    ? readdirSync(join(home, 'node_modules', '@deepseek-ai'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
    : 0;
  return {
    distro: selection.distro,
    version: manifest.version,
    api,
    defaultBundles: manifest.dsh.distro.defaultBundles ?? [],
    declaredHosts: hosts,
    installedHosts: installed,
    home,
  };
}
