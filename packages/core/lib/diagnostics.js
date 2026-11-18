import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect } from 'node:util';

const CREDENTIAL_WARNING = 'WARNING: Raw diagnostics may contain configuration or credential values from plugin errors. Review before sharing.\n\n';

function writeStderr(text) {
  return new Promise((resolve, reject) => {
    process.stderr.write(text, (problem) => (problem === null || problem === undefined ? resolve() : reject(problem)));
  });
}

export async function reportStartupFailure(error, { home, version, profile }, write = writeStderr) {
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

  await write(`${error.message}\n`);

  const directory = join(home, 'logs');
  const file = join(directory, `startup-${timestamp.replaceAll(':', '-')}-${randomUUID()}.log`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(file, report, { flag: 'wx', mode: 0o600 });
  } catch (problem) {
    await write(`\nnanodsh: warning: could not write startup diagnostics: ${String(problem)}\nFull diagnostics:\n${report}`);
    return;
  }
  await write(`\nFull diagnostics: ${file}\n`);
}
