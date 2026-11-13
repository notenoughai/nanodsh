import {
  PluginPackages,
  StartupError,
  boot,
  createRuntimeResolution,
  initProfile,
  loadLayeredEnv,
  loadOverlayPatches,
  loadProfile,
  readProfilePatches,
  reportSkippedBundles,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot';
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles';
import { provideCmdline } from '@deepseek-ai/dsh-cmdline';
import { reportStartupFailure } from './diagnostics.js';
import { VERSION } from './version.js';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME = 'nanodsh';
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url));
export const ROOT_FILENAME = 'cordis.yml';
const ROOT_CONFIG = '[]\n';
const FIBER_ACTIVE = 2;
const SHUTDOWN_BUDGET_MS = 5000;

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

export function initializeProfileFromDefault(name, templateName, home = resolveDshHome()) {
  const dir = resolveProfileDir(name, home);
  const template = Object.hasOwn(PROFILE_TEMPLATES, templateName) ? PROFILE_TEMPLATES[templateName] : undefined;
  if (template === undefined) {
    const expected = Object.keys(PROFILE_TEMPLATES).sort().map((value) => JSON.stringify(value)).join(', ');
    throw new Error(`${NAME}: unknown default profile ${JSON.stringify(templateName)}; expected one of ${expected}`);
  }
  const shipped = Object.keys(PROFILE_TEMPLATES).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  if (shipped !== undefined) {
    throw new Error(`${NAME}: profile ${JSON.stringify(name)} names shipped profile ${JSON.stringify(shipped)} and cannot be replaced; boot it without --from-default-profile`);
  }
  mkdirSync(dirname(dir), { recursive: true });
  const staging = mkdtempSync(join(dirname(dir), `.${name}.staging-`));
  const previous = join(staging, 'previous');
  try {
    const fresh = join(staging, 'new', name);
    initProfile(fresh, template.bundles);
    let moved = false;
    try {
      renameSync(dir, previous);
      moved = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      renameSync(fresh, dir);
    } catch (error) {
      if (existsSync(dir)) {
        rmSync(previous, { recursive: true, force: true });
        throw new Error(`${NAME}: profile ${JSON.stringify(name)} was recreated concurrently at ${dir}`, { cause: error });
      }
      if (moved) {
        try {
          renameSync(previous, dir);
        } catch (restoreError) {
          throw new AggregateError([error, restoreError], `${NAME}: profile replacement failed and ${dir} could not be restored from ${previous}`);
        }
      }
      throw error;
    }
  } catch (error) {
    if (!existsSync(previous)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  try {
    rmSync(staging, { recursive: true, force: true });
  } catch (error) {
    process.stderr.write(`${NAME}: replaced profile ${JSON.stringify(name)} but could not remove ${staging}: ${String(error)}\n`);
  }
}

export function loadLaunchProfile(name, home = resolveDshHome(), { fromDefaultProfile, userLayer = true } = {}) {
  if (fromDefaultProfile !== undefined) initializeProfileFromDefault(name, fromDefaultProfile, home);
  const profile = loadProfile(NAME, name, INSTALL_ANCHOR, home, { userLayer });

  reportSkippedBundles(NAME, profile);
  writeFileSync(join(profile.dir, ROOT_FILENAME), ROOT_CONFIG);
  return profile;
}

export async function runProfile({ profile: name, fromDefaultProfile, patches, args }) {
  loadLayeredEnv(NAME);
  const home = resolveDshHome();
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile });
  if (profile.layers.length === 0) {
    throw new Error(`${NAME}: profile ${JSON.stringify(name)} composes no entries; install its bundles first`);
  }
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
  const stop = (code) => {
    if (stopping !== undefined) return stopping;
    stopping = (async () => {
      const budget = setTimeout(() => process.exit(code), SHUTDOWN_BUDGET_MS);
      let failure;
      try {
        await ctx?.fiber.dispose();
      } catch (problem) {
        failure = problem;
      } finally {
        clearTimeout(budget);
      }
      if (failure !== undefined) process.stderr.write(`${NAME}: shutdown failed: ${String(failure)}\n`);
      process.exit(code);
    })();
    return stopping;
  };

  const interrupt = (code) => {
    interrupted = true;
    if (stopping !== undefined) process.exit(code);
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
      await reportStartupFailure(error, { home, version: VERSION, profile: name });
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
