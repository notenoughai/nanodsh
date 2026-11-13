#!/usr/bin/env node
import { parseArgs } from '../lib/args.js';
import { dumpConfig } from '../lib/dump-config.js';
import { runProfile } from '../lib/profile.js';
import { VERSION } from '../lib/version.js';

const invocation = parseArgs(process.argv.slice(2), VERSION);

try {
  if (invocation.dumpConfig) dumpConfig(invocation);
  else await runProfile(invocation);
} catch (error) {
  process.stderr.write(`${error.message ?? error}\n`);
  process.exit(1);
}
