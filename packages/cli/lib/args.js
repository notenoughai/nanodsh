import { Command, CommanderError, InvalidArgumentError } from 'commander';

const HELP_AFTER = `
Examples:
  nanodsh work                        boot the "work" profile from $DSH_HOME/profiles
  nanodsh --profile work              the same call, written out
  nanodsh work --port 8080            arguments after the profile name reach the app
  nanodsh work --help                 the profile's own flags and help
  nanodsh work --patch ./extra.yml    one extra overlay, for this run only
  nanodsh --instance work web         boot the profile from a registered instance
  nanodsh distro add @scope/distro-standard@0.0.1
                                      install the host a profile resolves against
  nanodsh instance list               every registered instance
  nanodsh profile create work --bundle @scope/bundle
                                      create a profile in the current instance
  nanodsh plugin --profile work add @scope/bundle
                                      install a bundle into a profile
  eval "$(nanodsh completion bash)"   complete the command in the current shell
  nanodsh --profile work --dump-config
                                      print the composed tree without booting
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
    .usage('[--profile] <name> [options] [app-args...]\n       nanodsh distro <command> [options]\n       nanodsh instance <command> [options]\n       nanodsh profile <command> [options]\n       nanodsh plugin --profile <name> <pnpm arguments...>\n       nanodsh completion <bash|zsh|fish|pwsh>')
    .description('nanodsh: boot a dsh profile. The profile owns its plugins, its app, and its command line.')
    .addHelpText('after', HELP_AFTER)
    .exitOverride()
    .helpOption(false)
    .helpCommand(false)
    .allowUnknownOption()
    .passThroughOptions()
    .enablePositionalOptions()
    .argument('[args...]', "arguments for the booted profile's app (see: nanodsh --profile <name> --help)")
    .option('--instance <name>', 'the registered instance to boot')
    .option('--home <path>', 'the harness home to boot, registered or not')
    .option('--profile <name>', 'the profile under $DSH_HOME/profiles to boot', selectProfile)
    .option('--from-default-profile <name>', 'replace a custom profile with a fresh copy of a shipped profile template')
    .option('--patch <path>', 'extra patch-list overlay applied after the profile layer (repeatable)', collect)
    .option('--dump-config', 'print the composed profile tree and exit')
    .option('--dump-config-schema', 'print JSON Schema for profile entries and patches and exit')
    .option('--dump-default-config', 'print the profile tree without its own layer or overlay patches and exit')
    .action((args, options) => {
      if (options.profile === undefined && args.some((argument) => argument === '-h' || argument === '--help')) program.help();
      if (options.profile === undefined && args.length > 0 && !args[0].startsWith('-')) options.profile = args.shift();
      if (options.profile === '') program.error('error: --profile needs a name');
      if (options.instance !== undefined && options.home !== undefined) program.error('error: --instance and --home are mutually exclusive');
      if (options.instance === '') program.error('error: --instance needs a name');
      if (options.home === '') program.error('error: --home needs a path');
      const dumps = [
        options.dumpConfig === true ? ['config', '--dump-config'] : undefined,
        options.dumpConfigSchema === true ? ['schema', '--dump-config-schema'] : undefined,
        options.dumpDefaultConfig === true ? ['default', '--dump-default-config'] : undefined,
      ].filter((mode) => mode !== undefined);
      if (dumps.length > 1) {
        program.error(`error: ${dumps.map(([, flag]) => flag).join(', ')} are mutually exclusive`);
      }
      if (dumps.length === 1 && args.length > 0) {
        program.error(`error: ${dumps[0][1]} takes no app arguments, got ${args.map((argument) => JSON.stringify(argument)).join(' ')}`);
      }
      if (options.dumpDefaultConfig === true && (options.patch ?? []).length > 0) {
        program.error('error: --dump-default-config prints the bundle layers and takes no --patch');
      }
      if (options.fromDefaultProfile === '') program.error('error: --from-default-profile needs a name');
      invocation = {
        profile: options.profile,
        fromDefaultProfile: options.fromDefaultProfile,
        patches: options.patch ?? [],
        args,
        dump: dumps[0]?.[0],
        instance: options.instance,
        home: options.home,
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
