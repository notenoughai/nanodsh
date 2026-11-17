import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';

export const SUPPORTED_DISTRO_API = 1;
const RUNTIME_PACKAGE = '@deepseek-ai/dsh-app-boot';
const PLAIN_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SELECTION_FILENAME = 'distro.json';

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`nanodsh: ${file} is not valid JSON: ${error.message}`, { cause: error });
  }
}

/** Whether a dependency value is a plain version rather than an alias or a path. */
export function isPlainVersion(value) {
  return typeof value === 'string' && PLAIN_VERSION.test(value);
}

/** The version installed under a name, aliases included; the manifest name is not checked. */
function installedVersion(home, name) {
  const file = join(home, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    const manifest = readJson(file);
    return isPlainVersion(manifest.version) ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

function packageManifest(home, name) {
  const file = join(home, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(file)) {
    throw new Error(`nanodsh: distro ${JSON.stringify(name)} is selected but not installed in ${join(home, 'node_modules')}; run "nanodsh distro add ${name}"`);
  }
  return readJson(file);
}

export function resolveInstance(home = resolveDshHome()) {
  const selectionFile = join(home, SELECTION_FILENAME);
  if (!existsSync(selectionFile)) return undefined;
  const selection = readJson(selectionFile);
  if (typeof selection.distro !== 'string' || selection.distro === '') {
    throw new Error(`nanodsh: ${selectionFile} does not name a distro`);
  }
  const anchor = join(home, 'package.json');
  if (!existsSync(anchor)) {
    throw new Error(`nanodsh: ${selectionFile} selects ${JSON.stringify(selection.distro)} but ${anchor} is missing; run "nanodsh distro add ${selection.distro}"`);
  }
  const manifest = packageManifest(home, selection.distro);
  const api = manifest.dsh?.distro?.api;
  if (api !== SUPPORTED_DISTRO_API) {
    throw new Error(`nanodsh: distro ${selection.distro}${manifest.version === undefined ? '' : `@${manifest.version}`} declares api ${JSON.stringify(api)} but this launcher supports ${SUPPORTED_DISTRO_API}`);
  }
  return {
    home,
    distro: selection.distro,
    version: selection.version,
    installAnchor: anchor,
    defaultBundles: manifest.dsh.distro.defaultBundles ?? [],
    allowBuilds: manifest.dsh.distro.allowBuilds ?? [],
    bundleVersion: installedVersion(home, RUNTIME_PACKAGE),
  };
}
