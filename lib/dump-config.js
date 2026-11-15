import {
  generateConfigSchema,
  loadOptionalPatches,
  loadOverlayPatches,
  renderConfigDump,
} from '@deepseek-ai/dsh-app-boot';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { INSTALL_ANCHOR, NAME, ROOT_FILENAME, loadLaunchProfile } from './profile.js';
import { resolveInstance } from './instance.js';

export function homePatchPath(home = resolveDshHome()) {
  return join(home, 'cordis.patch.yml');
}

export function collectLayers(profile, patches) {
  const layers = profile.layers.map((layer) => ({ label: layer.packageName, patches: layer.patches }));
  if (existsSync(profile.patchPath)) layers.push({ label: profile.patchPath, patches: profile.patches });
  const homePatch = homePatchPath();
  const homePatches = loadOptionalPatches(NAME, homePatch);
  if (homePatches !== undefined) layers.push({ label: homePatch, patches: homePatches });
  for (const file of patches) {
    const absolute = resolve(file);
    layers.push({ label: absolute, patches: loadOverlayPatches(NAME, absolute) });
  }
  return layers;
}

function renderDump(profile, layers) {
  const directory = mkdtempSync(join(tmpdir(), 'nanodsh-dump-'));
  const file = join(directory, ROOT_FILENAME);
  writeFileSync(file, '[]\n');
  try {
    return renderConfigDump(NAME, file, layers);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function dumpDefaultConfig({ profile: name, fromDefaultProfile }) {
  const home = resolveDshHome();
  const installAnchor = resolveInstance(home)?.installAnchor ?? INSTALL_ANCHOR;
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, userLayer: false, installAnchor });
  const layers = profile.layers.map((layer) => ({ label: layer.packageName, patches: layer.patches }));
  process.stdout.write(renderDump(profile, layers));
}

export function dumpConfig({ profile: name, fromDefaultProfile, patches }) {
  const home = resolveDshHome();
  const installAnchor = resolveInstance(home)?.installAnchor ?? INSTALL_ANCHOR;
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor });
  process.stdout.write(renderDump(profile, collectLayers(profile, patches)));
}

export async function dumpConfigSchema({ profile: name, fromDefaultProfile, patches }) {
  const home = resolveDshHome();
  const installAnchor = resolveInstance(home)?.installAnchor ?? INSTALL_ANCHOR;
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor });
  const layers = collectLayers(profile, patches);
  const stdoutWrite = process.stdout.write;
  let dump;
  process.stdout.write = process.stderr.write.bind(process.stderr);
  try {
    dump = await generateConfigSchema(profile, layers.map((layer) => layer.patches), installAnchor);
  } finally {
    process.stdout.write = stdoutWrite;
  }
  process.stdout.write(`${JSON.stringify(dump, null, 2)}\n`);
  for (const diagnostic of dump['x-cordis'].diagnostics) {
    const location = diagnostic.path === undefined ? '' : ` [${diagnostic.path}]`;
    process.stderr.write(`${NAME}: ${diagnostic.level}:${location} ${diagnostic.message}\n`);
  }
  if (!dump['x-cordis'].complete) process.exitCode = 1;
}
