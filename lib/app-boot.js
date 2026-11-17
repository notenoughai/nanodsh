import * as launcherAppBoot from '@deepseek-ai/dsh-app-boot';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE = '@deepseek-ai/dsh-app-boot';
const loaded = new Map();

/** The app-boot module the instance provides, loaded once per home. */
export async function loadAppBoot(home) {
  const cached = loaded.get(home);
  if (cached !== undefined) return cached;
  const appBoot = await resolveAppBoot(home);
  loaded.set(home, appBoot);
  return appBoot;
}

async function resolveAppBoot(home) {
  try {
    const require = createRequire(join(home, 'package.json'));
    return await import(pathToFileURL(require.resolve(PACKAGE)).href);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`nanodsh: ${home} does not provide ${PACKAGE} (${reason}); using the launcher copy, which can break profile reloads\n`);
    return launcherAppBoot;
  }
}
