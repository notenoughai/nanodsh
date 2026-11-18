import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { initProfile, readProfilePlugins, reconcileProfilePlugins } from '@deepseek-ai/dsh-app-boot';
import { runPnpm } from './distro.js';
import { isPlainVersion, resolveInstance } from './instance.js';
import { isProfileName } from './names.js';
import { INSTALL_ANCHOR, NAME } from './profile.js';

function pinHostVersions(args, version) {
  if (version === undefined || !isPlainVersion(version)) return args;
  return args.map((argument) => (argument.startsWith('@deepseek-ai/') && argument.lastIndexOf('@') === 0 ? `${argument}@${version}` : argument));
}

/** Forwards pnpm arguments to a profile and reports the bundles it now composes. */
export async function runPluginCommand({ home, profile, args }) {
  if (!isProfileName(profile)) throw new Error(`nanodsh: ${JSON.stringify(profile)} is not a valid profile name`);
  if (args.length === 0) {
    throw new Error('nanodsh: plugin needs pnpm arguments to forward, for example "add <package>"');
  }
  const notices = [];
  const profileDir = join(home, 'profiles', profile);
  const instance = resolveInstance(home);
  if (!existsSync(join(profileDir, 'package.json'))) {
    initProfile(profileDir, instance?.defaultBundles ?? []);
    notices.push(`nanodsh: initialized profile ${profile} at ${profileDir}`);
  }
  const installAnchor = instance?.installAnchor ?? INSTALL_ANCHOR;
  const forwarded = args[0] === 'add' ? pinHostVersions(args, instance?.bundleVersion) : args;
  const builds = ['add', 'install', 'update'].includes(args[0]) ? (instance?.allowBuilds ?? []) : [];
  const forwardedArgs = builds.length === 0 ? forwarded : [forwarded[0], ...builds.map((name) => `--allow-build=${name}`), ...forwarded.slice(1)];
  const location = { binName: NAME, profileDir, installAnchor };
  const before = readProfilePlugins(location);
  await runPnpm(forwardedArgs, profileDir);
  const { plugins, addedPlainDependencies } = reconcileProfilePlugins({ ...location, before, preserveDisabled: true });
  const enabled = plugins.dependencies.filter((dependency) => dependency.enabled).map((dependency) => dependency.name);
  return { profile, profileDir, enabled, addedPlainDependencies, notices };
}