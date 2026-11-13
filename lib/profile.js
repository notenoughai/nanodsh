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

function createReadiness() {
  let ready = false;
  const listeners = new Set();
  return {
    service: {
      onReady(listener) {
        if (ready) {
          listener();
          return () => {};
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    commit() {
      if (ready) return;
      ready = true;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
  };
}

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
  const readiness = createReadiness();
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
  let interrupted = false;
  let stopping;
  const stop = (code) => (stopping ??= (async () => {
    try {
      await ctx?.fiber.dispose();
    } finally {
      process.exit(code);
    }
  })());

  const interrupt = (code) => {
    interrupted = true;
    void stop(code);
  };
  process.on('SIGINT', () => interrupt(130));
  process.on('SIGTERM', () => interrupt(0));

  try {
    ctx = await boot(
      NAME,
      join(profile.dir, ROOT_FILENAME),
      readProfilePatches(NAME, profileContext, profile),
      async (hostCtx) => {
        hostCtx.provide('profileContext', profileContext);
        await hostCtx.plugin(PluginPackages, { resolution });
        provideCmdline(hostCtx, { args, exit: (code) => void stop(code), ready: readiness.service });
      },
    );
  } catch (error) {
    if (error instanceof StartupError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (!interrupted && ctx.fiber.state === FIBER_ACTIVE && ctx.get('loader') !== undefined) {
    readiness.commit();
  }
  if (ctx.fiber.state !== FIBER_ACTIVE) return;
  await new Promise((done) => {
    ctx.on('dispose', () => done());
  });
}
