import { Command, CommanderError, InvalidArgumentError } from 'commander';

const HELP_AFTER = `
Examples:
  nanodsh web                       boot the web profile (same as: nanodsh --profile web)
  nanodsh headless "run the tests"  the profile's app decides what the trailing words mean
  nanodsh tui --patch ./extra.yml   boot a profile with one extra overlay
  nanodsh web --help                the profile's own flags and help
`;

const collect = (value, previous = []) => [...previous, value];

function selectProfile(value, previous) {
  if (previous !== undefined) throw new InvalidArgumentError('select a profile only once');
  return value;
}

export function parseArgs(argv, version) {
  let invocation;
  const program = new Command();
  program
    .name('nanodsh')
    .version(version, '-V, --version', 'output the version number')
    .usage('[--profile] <name> [options] [app-args...]')
    .description('nanodsh: boot a dsh profile. The profile owns its plugins, its app, and its command line.')
    .addHelpText('after', HELP_AFTER)
    .exitOverride()
    .helpOption(false)
    .helpCommand(false)
    .allowUnknownOption()
    .passThroughOptions()
    .enablePositionalOptions()
    .argument('[args...]', "arguments for the booted profile's app (see: nanodsh --profile <name> --help)")
    .option('--profile <name>', 'the profile under $DSH_HOME/profiles to boot', selectProfile)
    .option('--patch <path>', 'extra patch-list overlay applied after the profile layer (repeatable)', collect)
    .option('--dump-config', 'print the composed profile tree and exit')
    .action((args, options) => {
      if (options.profile === undefined) {
        if (args.some((argument) => argument === '-h' || argument === '--help')) program.help();
        program.error('error: --profile <name> is required');
      }
      if (options.profile === '') program.error('error: --profile needs a name');
      if (options.dumpConfig === true && args.length > 0) {
        program.error(`error: --dump-config takes no app arguments, got ${args.map((argument) => JSON.stringify(argument)).join(' ')}`);
      }
      invocation = {
        profile: options.profile,
        patches: options.patch ?? [],
        args,
        dumpConfig: options.dumpConfig === true,
      };
    });

  const positional = argv[0] !== undefined && !argv[0].startsWith('-');
  try {
    program.parse(positional ? ['--profile', ...argv] : argv, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) process.exit(error.exitCode);
    throw error;
  }
  if (invocation === undefined) throw new Error('nanodsh: no invocation resolved');
  return invocation;
}
