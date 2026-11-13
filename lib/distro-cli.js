import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { addDistro, showDistro, switchDistro } from './distro.js';

const HELP = `Usage: nanodsh distro <command> [options]

Commands:
  add <package[@version]>      install a distro into the current instance
  show                         print the selected distro and what it provides
  switch <package[@version]>   install another distro and swap it in; profiles stay

The instance is $DSH_HOME, or the default harness home.
`;

function formatShow(selection) {
  const bundles = selection.defaultBundles.length === 0 ? '(none)' : selection.defaultBundles.join(', ');
  return `distro    ${selection.distro}@${selection.version} (api ${selection.api})
home      ${selection.home}
bundles   ${bundles}
hosts     ${selection.declaredHosts} declared, ${selection.installedHosts} installed
`;
}

export async function runDistroCli(argv) {
  const [command, ...rest] = argv;
  const home = resolveDshHome();
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  if (command === 'add') {
    const added = await addDistro(rest[0], home);
    process.stdout.write(`nanodsh: distro ${added.name}@${added.version} (api ${added.api}) installed in ${home}\n`);
    return;
  }
  if (command === 'show') {
    process.stdout.write(formatShow(showDistro(home)));
    return;
  }
  if (command === 'switch') {
    const switched = await switchDistro(rest[0], home);
    process.stdout.write(`nanodsh: distro ${switched.name}@${switched.version} (api ${switched.api}) is now selected in ${home}\n`);
    return;
  }
  throw new Error(`nanodsh: unknown distro command ${JSON.stringify(command)}; expected add, show or switch`);
}
