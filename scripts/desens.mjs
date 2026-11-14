import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PUBLIC_RULES = [
  { name: 'private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'token-prefix', pattern: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{20,}|\bxox[baprs]-[A-Za-z0-9-]{10,}|\bglpat-[A-Za-z0-9_-]{20,}|\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { name: 'internal-range', pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})\b/ },
  { name: 'home-path', pattern: /(?:\/home\/[A-Za-z0-9._-]+\/|\/Users\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\)/ },
];

const PUBLIC_ALLOW = [
  /example\.(?:com|test|org)/,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /localhost/,
  /203\.0\.113\.\d{1,3}/,
  /198\.51\.100\.\d{1,3}/,
  /192\.0\.2\.\d{1,3}/,
  /\{\{[A-Z0-9_]+\}\}/,
];

const OVERRIDE_VARIABLES = ['GITLEAKS_CONFIG', 'GITLEAKS_CONFIG_TOML'];
const ZERO = '0000000000000000000000000000000000000000';

const defaultRulesFile = () => {
  const base = process.env.XDG_CONFIG_HOME !== undefined && process.env.XDG_CONFIG_HOME.trim() !== ''
    ? process.env.XDG_CONFIG_HOME
    : join(homedir(), '.config');
  return join(base, 'nanodsh', 'desens.txt');
};

export function loadRules(file = process.env.NANODSH_DESENS_FILE ?? defaultRulesFile()) {
  const rules = PUBLIC_RULES.map((rule) => ({ ...rule }));
  const allow = [...PUBLIC_ALLOW];
  if (file !== undefined && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const entry = line.trim();
      if (entry === '' || entry.startsWith('#')) continue;
      if (entry.startsWith('allow ')) allow.push(new RegExp(entry.slice(6), 'i'));
      else rules.push({ name: 'private', pattern: new RegExp(entry, 'i') });
    }
  }
  return { rules, allow };
}

const allowed = (rules, value) => rules.allow.some((pattern) => pattern.test(value));

export function scanText(text, path, rules) {
  const findings = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of rules.rules) {
      const match = rule.pattern.exec(lines[index]);
      if (match === null || allowed(rules, match[0])) continue;
      findings.push({ rule: rule.name, path, line: index + 1 });
    }
  }
  return findings;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function scanPatch(patch, rules) {
  const findings = [];
  let path;
  let line = 0;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('+++ ')) {
      path = raw.slice(4).replace(/^b\//, '');
      line = 0;
      continue;
    }
    if (!raw.startsWith('+') || raw.startsWith('+++')) continue;
    line += 1;
    for (const finding of scanText(raw.slice(1), path, rules)) findings.push({ ...finding, line });
  }
  return findings;
}

function scanRevs(revArgs, rules) {
  const findings = [];
  for (const rev of git(['rev-list', ...revArgs]).split('\n').filter(Boolean)) {
    findings.push(...scanPatch(git(['show', '--format=', '--no-color', '--unified=0', rev]), rules).map((finding) => ({ ...finding, commit: rev })));
    findings.push(...scanText(git(['log', '-1', '--format=%B', rev]), rev, rules).map((finding) => ({ ...finding, message: true })));
  }
  return findings;
}

function stagedFindings(rules) {
  const findings = scanPatch(git(['diff', '--cached', '--no-color', '--unified=0', '--diff-filter=ACMR']), rules);
  for (const path of git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean)) {
    for (const finding of scanText(path, path, rules)) findings.push({ ...finding, line: 0 });
  }
  return findings;
}

export function parsePrePush(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const [, localSha, , remoteSha] = line.trim().split(' ');
    if (localSha === undefined || localSha === ZERO) continue;
    entries.push(remoteSha === undefined || remoteSha === ZERO ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`]);
  }
  return entries;
}

function prePushScans(rules) {
  const findings = [];
  const logOpts = [];
  for (const revArgs of parsePrePush(readFileSync(0, 'utf8'))) {
    findings.push(...scanRevs(revArgs, rules));
    logOpts.push(revArgs.join(' '));
  }
  return { findings, logOpts };
}

function runSecrets(mode, required) {
  const args = ['scripts/secrets.mjs', ...mode, ...(required ? ['--required'] : [])];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  return result.status ?? 1;
}

function report(findings) {
  for (const finding of findings) {
    const where = finding.message === true ? `commit ${finding.commit}` : finding.line === 0 ? finding.path : `${finding.path}:${finding.line}`;
    process.stderr.write(`block ${finding.rule} ${where}\n`);
  }
  return findings.length;
}

export function main(argv = process.argv.slice(2)) {
  for (const name of OVERRIDE_VARIABLES) {
    if (process.env[name] !== undefined) {
      throw new Error(`nanodsh: ${name} is set; a ruleset that can be replaced without a diff is not a gate`);
    }
  }
  const rules = loadRules();
  const messageIndex = argv.indexOf('--message');
  const rangeIndex = argv.indexOf('--range');
  let findings = [];
  let secretsMode = ['--none'];
  if (argv.includes('--staged')) {
    findings = stagedFindings(rules);
    secretsMode = ['--staged'];
  } else if (argv.includes('--pre-push')) {
    const scanned = prePushScans(rules);
    findings = scanned.findings;
    if (scanned.logOpts.length > 0) secretsMode = ['--range', scanned.logOpts.join(' ')];
  } else if (messageIndex !== -1) {
    findings = scanText(readFileSync(argv[messageIndex + 1], 'utf8'), 'commit message', rules);
  } else if (rangeIndex !== -1) {
    findings = scanRevs(argv[rangeIndex + 1].split(' '), rules);
    secretsMode = ['--range', argv[rangeIndex + 1]];
  } else {
    throw new Error('nanodsh: dens needs one of --staged, --message <file>, --pre-push or --range <range>');
  }

  const count = report(findings);
  const secretsStatus = argv.includes('--no-secrets') ? 0 : runSecrets(secretsMode, argv.includes('--required-secrets'));
  if (count > 0) {
    process.stderr.write(`nanodsh: ${count} finding${count === 1 ? '' : 's'}\n`);
    return 1;
  }
  return secretsStatus;
}

if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
