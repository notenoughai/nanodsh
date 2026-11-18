export {
  expandHome,
  instanceHome,
  namesSharingHome,
  readRegistry,
  registryFile,
  resolvedHome,
  updateRegistry,
  writeRegistry,
} from './lib/registry.js';
export { overriddenNotice, selectHome, selectionFlags, withoutSelectionFlags } from './lib/selection.js';
export { SUPPORTED_DISTRO_API, isPlainVersion, resolveInstance } from './lib/instance.js';
export { addDistro, runPnpm, showDistro, switchDistro } from './lib/distro.js';
export {
  createInstance,
  defaultInstance,
  listInstances,
  removeInstance,
  renameInstance,
  setDefaultInstance,
  setInstance,
  showInstance,
} from './lib/instances.js';
export { createProfile, listProfiles, profilesDir, removeProfile } from './lib/profiles.js';
export { runPluginCommand } from './lib/plugins.js';
export { isProfileName } from './lib/names.js';
export { loadAppBoot, loadInstanceModule } from './lib/instance-modules.js';
export { VERSION } from './lib/version.js';
export { reportStartupFailure } from './lib/diagnostics.js';
export { collectLayers, composeConfig, composeDefaultConfig, composeSchema, homePatchPath } from './lib/dump-config.js';
export {
  INSTALL_ANCHOR,
  NAME,
  ROOT_FILENAME,
  boot,
  initializeProfileFromDefault,
  loadLaunchProfile,
} from './lib/profile.js';