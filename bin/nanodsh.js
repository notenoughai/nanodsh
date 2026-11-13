#!/usr/bin/env node
import { parseArgs } from '../lib/args.js';
import { runDistroCli } from '../lib/distro-cli.js';
import { dumpConfig, dumpConfigSchema, dumpDefaultConfig } from '../lib/dump-config.js';
import { runProfile } from '../lib/profile.js';
import { VERSION } from '../lib/version.js';

const argv = process.argv.slice(2);

try {
  if (argv[0] === 'distro') {
    await runDistroCli(argv.slice(1));
  } else {
    const invocation = parseArgs(argv, VERSION);
    if (invocation.dump === 'config') dumpConfig(invocation);
    else if (invocation.dump === 'default') dumpDefaultConfig(invocation);
    else if (invocation.dump === 'schema') await dumpConfigSchema(invocation);
    else await runProfile(invocation);
  }
} catch (error) {
  process.stderr.write(`${error.message ?? error}\n`);
  process.exit(1);
}
