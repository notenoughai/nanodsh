import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';

const CREDENTIAL_WARNING = 'WARNING: Raw diagnostics may contain configuration or credential values from plugin errors. Review before sharing.\n\n';

/** Writes the startup report to the home and returns what a caller should say. */
export async function reportStartupFailure(error, { home, version, profile }) {
  const timestamp = new Date().toISOString();
  const report = CREDENTIAL_WARNING + inspect({
    timestamp,
    launcherVersion: version,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    profile,
    error,
  }, {
    depth: null,
    maxArrayLength: null,
    maxStringLength: null,
    showHidden: true,
    customInspect: false,
    getters: false,
    colors: false,
  }) + '\n';

  const directory = join(home, 'logs');
  const file = join(directory, `startup-${timestamp.replaceAll(':', '-')}-${randomUUID()}.log`);
  const message = `${error.message}\n`;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(file, report, { flag: 'wx', mode: 0o600 });
  } catch (problem) {
    return {
      message,
      report,
      warnings: [`nanodsh: warning: could not write startup diagnostics: ${String(problem)}`],
      written: false,
    };
  }
  return { message, report, file, warnings: [], written: true };
}