import { initProfile, loadProfile, resolveProfileDir } from '@deepseek-ai/dsh-app-boot';
import { loadAppBoot, loadInstanceModule } from './instance-modules.js';
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles';
import { provideCmdline } from '@deepseek-ai/dsh-cmdline';
import { reportStartupFailure } from './diagnostics.js';
import { resolveInstance } from './instance.js';
import { assertBootNodeVersion } from './node-version.js';
import { VERSION } from './version.js';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NAME = 'nanodsh';
export const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url));
export const ROOT_FILENAME = 'cordis.yml';
const ROOT_CONFIG = '[]\n';
const FIBER_ACTIVE = 2;
const SHUTDOWN_TIMEOUT_MS = 10_000;

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
    return [`${NAME}: replaced profile ${JSON.stringify(name)} but could not remove ${staging}: ${String(error)}\n`];
  }
  return [];
}

export function loadLaunchProfile(name, home = resolveDshHome(), { fromDefaultProfile, userLayer = true, installAnchor = INSTALL_ANCHOR, appBoot = { loadProfile } } = {}) {
  const notices = fromDefaultProfile === undefined ? [] : initializeProfileFromDefault(name, fromDefaultProfile, home);
  const profile = appBoot.loadProfile(NAME, name, installAnchor, home, { userLayer });
  for (const { packageName, reason } of profile.skippedBundles ?? []) {
    notices.push(`${NAME}: skipping profile bundle ${JSON.stringify(packageName)}: ${reason}\n`);
  }
  return { ...profile, notices };
}

function hasComposedEntries(entries) {
  return entries.some((entry) => entry.disabled !== true && (Array.isArray(entry.config) ? hasComposedEntries(entry.config) : true));
}

export function homePatchPath(home) {
  return join(home, 'cordis.patch.yml');
}

/** The layers a boot composes, in order, each labelled with where it came from. */
export async function collectLayers({ profile, patches = [], home, appBoot }) {
  const layers = profile.layers.map((layer) => ({ label: layer.packageName, patches: layer.patches }));
  if (existsSync(profile.patchPath)) layers.push({ label: profile.patchPath, patches: profile.patches });
  const homePatch = homePatchPath(home);
  const homePatches = appBoot.loadOptionalPatches(NAME, homePatch);
  if (homePatches !== undefined) layers.push({ label: homePatch, patches: homePatches });
  for (const file of patches) {
    const absolute = resolve(file);
    layers.push({ label: absolute, patches: appBoot.loadOverlayPatches(NAME, absolute) });
  }
  return layers;
}

/** Boots a profile and returns the context; signals, printing and exit codes stay with the caller. */
export async function boot({ home = resolveDshHome(), profile: name, fromDefaultProfile, patches = [], args = [], env = process.env, warn, nodeVersion = process.versions.node } = {}) {
  assertBootNodeVersion(nodeVersion);
  const appBoot = await loadAppBoot(home, { warn });
  const environment = Object.freeze(appBoot.loadLayeredEnv(NAME));
  let disposeProxy = async () => {};
  try {
    const httpProxy = await loadInstanceModule(home, '@deepseek-ai/dsh-http-proxy', { warn });
    disposeProxy = await httpProxy.installProxyFromEnvironment(environment, (message) => {
      warn?.(`${NAME}: ${message}\n`);
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn?.(`${NAME}: the proxy was not installed (${reason}); booting without it, so requests go direct. Proxy support needs Node.js >= 22.19.0\n`);
  }
  const instance = resolveInstance(home);
  const installAnchor = instance?.installAnchor ?? INSTALL_ANCHOR;
  const profile = loadLaunchProfile(name, home, { fromDefaultProfile, installAnchor, appBoot });
  writeFileSync(join(profile.dir, ROOT_FILENAME), ROOT_CONFIG);
  const entries = appBoot.composeEntries((await collectLayers({ profile, patches, home, appBoot })).map((layer) => layer.patches), (message) => warn?.(`${NAME}: ${message}\n`));
  if (!hasComposedEntries(entries)) {
    throw new Error(`${NAME}: profile ${JSON.stringify(name)} composes no entries; install its bundles first`);
  }
  const overlays = patches.flatMap((file) => appBoot.loadOverlayPatches(NAME, resolve(file)));
  const resolution = await appBoot.createRuntimeResolution({ installAnchor, profile });
  const readiness = createReadiness();
  const profileContext = {
    name: profile.name,
    dir: profile.dir,
    patchPath: profile.patchPath,
    installAnchor,
    startedBundles: profile.layers.map((layer) => layer.packageName),
    cwd: env.PWD ?? process.cwd(),
    home,
    overlays,
    telemetryDisabledEnv: env.DSH_TELEMETRY_DISABLED,
  };

  let ctx;
  let stopping;
  let exitCode;
  let settleReady;
  let settleExit;
  const ready = new Promise((resolveReady) => {
    settleReady = resolveReady;
  });
  const exited = new Promise((resolveExit) => {
    settleExit = resolveExit;
  });
  const requestExit = (code) => {
    if (exitCode === undefined) {
      exitCode = code;
      settleExit(code);
    }
  };
  const stop = (code) => {
    if (stopping !== undefined) return stopping;
    stopping = (async () => {
      let failure;
      const forced = setTimeout(() => {
        warn?.(`${NAME}: shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS}ms; exiting\n`);
        requestExit(code);
      }, SHUTDOWN_TIMEOUT_MS);
      try {
        await ctx?.fiber.dispose();
      } catch (problem) {
        failure = problem;
      }
      try {
        await disposeProxy();
      } catch (problem) {
        failure ??= problem;
      }
      clearTimeout(forced);
      settleReady();
      if (failure !== undefined) warn?.(`${NAME}: shutdown failed: ${String(failure)}\n`);
      requestExit(code);
      return code;
    })();
    return stopping;
  };

  try {
    ctx = await appBoot.boot(
      NAME,
      join(profile.dir, ROOT_FILENAME),
      appBoot.readProfilePatches(NAME, profileContext, profile),
      async (hostCtx) => {
        hostCtx.provide('profileContext', profileContext);
        hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment);
        await hostCtx.plugin(appBoot.PluginPackages, { resolution });
        provideCmdline(hostCtx, { args, exit: (code) => void stop(code), ready: readiness.service });
      },
    );
  } catch (error) {
    if (error instanceof appBoot.StartupError) {
      const failure = await reportStartupFailure(error, { home, version: VERSION, profile: name });
      throw Object.assign(new Error(failure.message, { cause: error }), { startupFailure: failure });
    }
    await stop(1);
    throw error;
  }

  if (ctx.fiber.state === FIBER_ACTIVE && ctx.get('loader') !== undefined) {
    readiness.commit();
  }
  settleReady();
  if (ctx.fiber.state !== FIBER_ACTIVE) requestExit(0);
  return { ctx, stop, ready, exited, notices: profile.notices };

}
