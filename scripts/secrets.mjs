import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '8.30.1';
const SHA256 = {
  linux_x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  linux_arm64: 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  darwin_x64: 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  darwin_arm64: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
};
const OVERRIDE_VARIABLES = ['GITLEAKS_CONFIG', 'GITLEAKS_CONFIG_TOML'];
const CACHE = fileURLToPath(new URL('../.cache/gitleaks/', import.meta.url));

async function ensureBinary() {
  const binary = join(CACHE, VERSION, 'gitleaks');
  if (existsSync(binary)) return binary;
  const key = `${process.platform}_${process.arch}`;
  const digest = SHA256[key];
  if (digest === undefined) throw new Error(`nanodsh: no pinned gitleaks build for ${key}`);
  const directory = join(CACHE, VERSION);
  mkdirSync(directory, { recursive: true });
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_${key}.tar.gz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`nanodsh: could not download gitleaks (${response.status})`);
  const archive = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== digest) throw new Error('nanodsh: gitleaks archive does not match its pinned checksum');
  const tarball = join(directory, 'gitleaks.tar.gz');
  writeFileSync(tarball, archive);
  execFileSync('tar', ['-xzf', tarball, '-C', directory, 'gitleaks']);
  rmSync(tarball);
  chmodSync(binary, 0o755);
  return binary;
}

export async function main(argv = process.argv.slice(2)) {
  for (const name of OVERRIDE_VARIABLES) {
    if (process.env[name] !== undefined) {
      throw new Error(`nanodsh: ${name} is set; a ruleset that can be replaced without a diff is not a gate`);
    }
  }
  if (argv.includes('--none')) return 0;
  const required = argv.includes('--required');
  let binary;
  try {
    binary = await ensureBinary();
  } catch (error) {
    if (required) throw error;
    process.stderr.write(`${error.message}; secrets were not scanned\n`);
    return 0;
  }
  const args = argv.includes('--staged')
    ? ['git', '--pre-commit', '--redact', '--staged', '--verbose', '--exit-code', '1']
    : ['git', '--redact', '--verbose', '--exit-code', '1', `--log-opts=--all ${argv[argv.indexOf('--range') + 1]}`];
  const result = spawnSync(binary, args, { stdio: 'inherit' });
  return result.status ?? 1;
}

if (import.meta.main) {
  main().then((code) => {
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
