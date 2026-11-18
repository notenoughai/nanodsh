import {
  generateConfigSchema,
  loadOptionalPatches,
  loadOverlayPatches,
  renderConfigDump,
} from '@deepseek-ai/dsh-app-boot';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { INSTALL_ANCHOR, NAME, ROOT_FILENAME, loadLaunchProfile } from './profile.js';
import { resolveInstance } from './instance.js';

export function homePatchPath(home) {
  return join(home, 'cordis.patch.yml');
}

/** The layers a dump composes, in order, each labelled with where it came from. */
export function collectLayers({ profile, patches = [], home }) {
  const layers = profile.layers.map((layer) => ({ label: layer.packageName, patches: layer.patches }));
  if (existsSync(profile.patchPath)) layers.push({ label: profile.patchPath, patches: profile.patches });
  const homePatch = homePatchPath(home);
  const homePatches = loadOptionalPatches(NAME, homePatch);
  if (homePatches !== undefined) layers.push({ label: homePatch, patches: homePatches });
  for (const file of patches) {
    const absolute = resolve(file);
    layers.push({ label: absolute, patches: loadOverlayPatches(NAME, absolute) });
  }
  return layers;
}

function renderDump(layers) {
  const directory = mkdtempSync(join(tmpdir(), 'nanodsh-dump-'));
  const file = join(directory, ROOT_FILENAME);
  writeFileSync(file, '[]\n');
  try {
    return renderConfigDump(NAME, file, layers);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function anchorOf(home) {
  return resolveInstance(home)?.installAnchor ?? INSTALL_ANCHOR;
}

/** The composed tree, as text for a caller to print. */
export function composeConfig({ home, profile: name, fromDefaultProfile, patches = [] }) {
  const installAnchor = anchorOf(home);
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor });
  return { text: renderDump(collectLayers({ profile, patches, home })), notices: profile.notices };
}

/** The composed tree without the user layer, as text. */
export function composeDefaultConfig({ home, profile: name, fromDefaultProfile }) {
  const installAnchor = anchorOf(home);
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, userLayer: false, installAnchor });
  const layers = profile.layers.map((layer) => ({ label: layer.packageName, patches: layer.patches }));
  return { text: renderDump(layers), notices: profile.notices };
}

/** The schema of the composed tree, plus the diagnostics that came with it. */
export async function composeSchema({ home, profile: name, fromDefaultProfile, patches = [] }) {
  const installAnchor = anchorOf(home);
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor });
  const layers = collectLayers({ profile, patches, home });
  const dump = await generateConfigSchema(profile, layers.map((layer) => layer.patches), installAnchor);
  const complete = dump['x-cordis'].complete;
  const diagnostics = dump['x-cordis'].diagnostics.map((diagnostic) => {
    const location = diagnostic.path === undefined ? '' : ` [${diagnostic.path}]`;
    return `${NAME}: ${diagnostic.level}:${location} ${diagnostic.message}\n`;
  });
  return { dump, diagnostics, complete, notices: profile.notices };
}