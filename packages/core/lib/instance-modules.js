import * as launcherAppBoot from '@deepseek-ai/dsh-app-boot';
import * as launcherHttpProxy from '@deepseek-ai/dsh-http-proxy';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FALLBACKS = new Map([
  ['@deepseek-ai/dsh-app-boot', launcherAppBoot],
  ['@deepseek-ai/dsh-http-proxy', launcherHttpProxy],
]);
const loaded = new Map();

/** The instance's copy of a launcher dependency, so launcher and plugins share one module state. */
export async function loadInstanceModule(home, name, { warn } = {}) {
  const key = `${home}\u0000${name}`;
  const cached = loaded.get(key);
  if (cached !== undefined) return cached;
  const module = await resolveInstanceModule(home, name, warn);
  loaded.set(key, module);
  return module;
}

/** The app-boot module the instance provides, loaded once per home. */
export function loadAppBoot(home, options) {
  return loadInstanceModule(home, '@deepseek-ai/dsh-app-boot', options);
}

async function resolveInstanceModule(home, name, warn) {
  const fallback = FALLBACKS.get(name);
  if (fallback === undefined) throw new Error(`nanodsh: no launcher fallback for ${name}`);
  try {
    const require = createRequire(join(home, 'package.json'));
    return await import(pathToFileURL(require.resolve(name)).href);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn?.(`nanodsh: ${home} does not provide ${name} (${reason}); using the launcher copy, which can split module state\n`);
    return fallback;
  }
}
