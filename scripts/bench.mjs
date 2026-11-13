#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/nanodsh.js', import.meta.url));
const iterations = Number(process.argv[2] ?? 15);

function sample(args, env) {
  const times = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [bin, ...args], { env, stdio: 'ignore' });
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    if (result.status !== 0) throw new Error(`nanodsh ${args.join(' ')} exited ${result.status}`);
    times.push(elapsed);
  }
  times.sort((left, right) => left - right);
  return {
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
  };
}

function stubHome() {
  const home = mkdtempSync(join(tmpdir(), 'nanodsh-bench-'));
  const profile = join(home, 'profiles', 'bench');
  const bundle = join(profile, 'node_modules', 'bench-bundle');
  const plugin = join(profile, 'node_modules', 'bench-plugin');
  mkdirSync(bundle, { recursive: true });
  mkdirSync(plugin, { recursive: true });
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'bench', private: true, dependencies: { 'bench-bundle': '*' }, dsh: { profile: { bundles: ['bench-bundle'] } } }));
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'bench-bundle', version: '0.0.0', private: true, dsh: { bundle: { patch: './cordis.patch.yml' } } }));
  writeFileSync(join(bundle, 'cordis.patch.yml'), '- insert:\n    - id: bench\n      name: bench-plugin\n');
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'bench-plugin', version: '0.0.0', private: true, type: 'module', exports: './index.js' }));
  writeFileSync(join(plugin, 'index.js'), 'export const name = "bench";\nexport function apply(ctx) {\n  const exit = ctx.get("appExit");\n  const timer = setTimeout(() => exit(0), 10);\n  ctx.effect(() => () => clearTimeout(timer));\n}\n');
  return home;
}

const home = stubHome();
const env = { ...process.env, DSH_HOME: home, XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'nanodsh-bench-xdg-')) };
const rows = [
  ['--version', sample(['--version'], env)],
  ['--help', sample(['--help'], env)],
  ['--dump-config', sample(['--profile', 'bench', '--dump-config'], env)],
  ['boot a stub profile', sample(['--profile', 'bench'], env)],
];

process.stdout.write(`nanodsh overhead, ${iterations} runs each, milliseconds\n\n`);
process.stdout.write(`${'command'.padEnd(22)}${'median'.padStart(9)}${'p95'.padStart(9)}\n`);
for (const [label, { median, p95 }] of rows) {
  process.stdout.write(`${label.padEnd(22)}${median.toFixed(0).padStart(9)}${p95.toFixed(0).padStart(9)}\n`);
}
rmSync(home, { recursive: true, force: true });
