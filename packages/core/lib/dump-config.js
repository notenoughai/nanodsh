import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INSTALL_ANCHOR, NAME, ROOT_FILENAME, collectLayers, loadLaunchProfile } from './profile.js';
import { loadAppBoot } from './instance-modules.js';
import { resolveInstance } from './instance.js';

export { collectLayers, homePatchPath } from './profile.js';

function anchorOf(home) {
  return resolveInstance(home)?.installAnchor ?? INSTALL_ANCHOR;
}

function runtimeOf(home, appBoot) {
  return appBoot ?? loadAppBoot(home);
}

function renderDump(layers, runtime) {
  const directory = mkdtempSync(join(tmpdir(), 'nanodsh-dump-'));
  const file = join(directory, ROOT_FILENAME);
  writeFileSync(file, '[]\n');
  try {
    return runtime.renderConfigDump(NAME, file, layers);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The composed tree, as text for a caller to print. */
export async function composeConfig({ home, profile: name, fromDefaultProfile, patches = [], appBoot }) {
  const runtime = await runtimeOf(home, appBoot);
  const installAnchor = anchorOf(home);
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor, appBoot: runtime });
  const layers = await collectLayers({ profile, patches, home, appBoot: runtime });
  return { text: renderDump(layers, runtime), notices: profile.notices };
}

/** The composed tree without the user layer, as text. */
export async function composeDefaultConfig({ home, profile: name, fromDefaultProfile, appBoot }) {
  const runtime = await runtimeOf(home, appBoot);
  const installAnchor = anchorOf(home);
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, userLayer: false, installAnchor, appBoot: runtime });
  const layers = profile.layers.map((layer) => ({ label: layer.packageName, patches: layer.patches }));
  return { text: renderDump(layers, runtime), notices: profile.notices };
}

/** The schema of the composed tree, plus the diagnostics that came with it. */
export async function composeSchema({ home, profile: name, fromDefaultProfile, patches = [], appBoot }) {
  const runtime = await runtimeOf(home, appBoot);
  const installAnchor = anchorOf(home);
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor, appBoot: runtime });
  const layers = await collectLayers({ profile, patches, home, appBoot: runtime });
  const dump = await runtime.generateConfigSchema(profile, layers.map((layer) => layer.patches), installAnchor);
  const complete = dump['x-cordis'].complete;
  const diagnostics = dump['x-cordis'].diagnostics.map((diagnostic) => {
    const location = diagnostic.path === undefined ? '' : ` [${diagnostic.path}]`;
    return `${NAME}: ${diagnostic.level}:${location} ${diagnostic.message}\n`;
  });
  return { dump, diagnostics, complete, notices: profile.notices };
}