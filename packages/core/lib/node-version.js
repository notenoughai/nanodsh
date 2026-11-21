const BOOT_NODE = [22, 12, 0];

function parts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(version, floor) {
  for (let index = 0; index < floor.length; index += 1) {
    if (version[index] !== floor[index]) return version[index] > floor[index];
  }
  return true;
}

/** Refuses to boot a profile on a Node.js the composed runtime cannot load. */
export function assertBootNodeVersion(version) {
  const parsed = parts(version);
  if (parsed === undefined || atLeast(parsed, BOOT_NODE)) return;
  throw new Error(`nanodsh: booting a profile needs Node.js >= ${BOOT_NODE.join('.')}; this is ${version}`);
}
