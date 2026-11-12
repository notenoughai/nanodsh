import {
  PluginPackages,
  StartupError,
  boot,
  createRuntimeResolution,
  loadOverlayPatches,
  loadProfile,
  readProfilePatches,
  reportSkippedBundles,
} from '@deepseek-ai/dsh-app-boot';
import { provideCmdline } from '@deepseek-ai/dsh-cmdline';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME = 'nanodsh';
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url));
export const ROOT_FILENAME = 'cordis.yml';
const ROOT_CONFIG = '[]\n';
const FIBER_ACTIVE = 2;

export function loadLaunchProfile(name, home = resolveDshHome()) {
  const profile = loadProfile(NAME, name, INSTALL_ANCHOR, home, { userLayer: true });
  reportSkippedBundles(NAME, profile);
  writeFileSync(join(profile.dir, ROOT_FILENAME), ROOT_CONFIG);
  return profile;
}

export async function runProfile({ profile: name, patches, args }) {
  const home = resolveDshHome();
  const profile = loadLaunchProfile(name, home);
  const overlays = patches.flatMap((file) => loadOverlayPatches(NAME, resolve(file)));
  const resolution = await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile });
  const profileContext = {
    name: profile.name,
    dir: profile.dir,
    patchPath: profile.patchPath,
    installAnchor: INSTALL_ANCHOR,
    startedBundles: profile.layers.map((layer) => layer.packageName),
    cwd: process.cwd(),
    home,
    overlays,
    telemetryDisabledEnv: process.env.DSH_TELEMETRY_DISABLED,
  };

  let ctx;
  let stopping;
  const stop = (code) => (stopping ??= (async () => {
    try {
      await ctx?.fiber.dispose();
    } finally {
      process.exit(code);
    }
  })());

  process.on('SIGINT', () => void stop(130));
  process.on('SIGTERM', () => void stop(0));

  try {
    ctx = await boot(
      NAME,
      join(profile.dir, ROOT_FILENAME),
      readProfilePatches(NAME, profileContext, profile),
      async (hostCtx) => {
        hostCtx.provide('profileContext', profileContext);
        await hostCtx.plugin(PluginPackages, { resolution });
        provideCmdline(hostCtx, { args, exit: (code) => void stop(code) });
      },
    );
  } catch (error) {
    if (error instanceof StartupError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (ctx.fiber.state !== FIBER_ACTIVE) return;
  await new Promise((done) => {
    ctx.on('dispose', () => done());
  });
}
