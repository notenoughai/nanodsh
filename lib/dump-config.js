import {
  loadOptionalPatches,
  loadOverlayPatches,
  renderConfigDump,
} from '@deepseek-ai/dsh-app-boot';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NAME, ROOT_FILENAME, loadLaunchProfile } from './profile.js';

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

export function dumpConfig({ profile: name, patches }) {
  const profile = loadLaunchProfile(name);
  process.stdout.write(renderConfigDump(NAME, join(profile.dir, ROOT_FILENAME), collectLayers(profile, patches)));
}
