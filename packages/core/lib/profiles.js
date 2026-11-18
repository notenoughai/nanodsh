import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initProfile } from '@deepseek-ai/dsh-app-boot';
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles';
import { resolveInstance } from './instance.js';
import { isProfileName } from './names.js';

const RESERVED = ['plugin', 'distro', 'instance', 'completion'];

export function profilesDir(home) {
  return join(home, 'profiles');
}

function bundlesOf(profile) {
  try {
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
    return Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
  } catch {
    return [];
  }
}

/** Every profile in the home, with the bundles each one composes. */
export function listProfiles({ home }) {
  const dir = profilesDir(home);
  const names = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort()
    : [];
  return {
    dir,
    profiles: names.map((name) => ({
      name,
      bundles: bundlesOf(join(dir, name)),
      shipped: Object.hasOwn(PROFILE_TEMPLATES, name),
    })),
  };
}

/** Creates a profile directory; bundles default to the distro's own list. */
export function createProfile({ home, name, bundles }) {
  if (!isProfileName(name)) throw new Error(`nanodsh: ${JSON.stringify(name)} is not a valid profile name`);
  const notices = [];
  if (RESERVED.includes(name.toLowerCase())) {
    notices.push(`nanodsh: ${JSON.stringify(name)} is also a subcommand name; boot it with --profile ${name}`);
  }
  if (Object.hasOwn(PROFILE_TEMPLATES, name)) {
    notices.push(`nanodsh: ${JSON.stringify(name)} names a shipped template; a profile of this name would otherwise initialise from it`);
  }
  const dir = join(profilesDir(home), name);
  if (existsSync(dir)) throw new Error(`nanodsh: profile ${JSON.stringify(name)} already exists at ${dir}`);
  const chosen = bundles.length > 0 ? bundles : resolveInstance(home)?.defaultBundles ?? [];
  initProfile(dir, chosen);
  return { name, dir, bundles: chosen, notices };
}

/** Deletes a profile directory, refusing to follow a link out of the home. */
export function removeProfile({ home, name, confirmed = false }) {
  if (!isProfileName(name)) throw new Error(`nanodsh: ${JSON.stringify(name)} is not a valid profile name`);
  const dir = join(profilesDir(home), name);
  if (!existsSync(dir)) throw new Error(`nanodsh: profile ${JSON.stringify(name)} does not exist at ${dir}`);
  if (!confirmed) throw new Error(`nanodsh: removing a profile deletes ${dir}; pass --yes to confirm`);
  const resolved = realpathSync(dir);
  if (resolved === '/' || resolved === realpathSync(homedir())) throw new Error(`nanodsh: refusing to delete ${resolved}`);
  const notices = [];
  if (lstatSync(dir).isSymbolicLink()) {
    rmSync(dir, { force: true });
    notices.push(`nanodsh: ${dir} was a symbolic link; removed the link and left ${resolved} in place`);
  } else {
    rmSync(resolved, { recursive: true, force: true });
  }
  return { name, dir, notices };
}