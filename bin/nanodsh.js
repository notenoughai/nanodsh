#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from '../lib/args.js';
import { dumpConfig } from '../lib/dump-config.js';
import { runProfile } from '../lib/profile.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const invocation = parseArgs(process.argv.slice(2), version);

try {
  if (invocation.dumpConfig) dumpConfig(invocation);
  else await runProfile(invocation);
} catch (error) {
  process.stderr.write(`${error.message ?? error}\n`);
  process.exit(1);
}
