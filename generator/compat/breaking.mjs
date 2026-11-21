// Breaking-change check (ADR 0001). Compares every service document with the pull
// request's base and fails when something breaks but the PR title has no `!`.
//
//   BASE_REF  commit to compare with (default: merge base with origin/main)
//   PR_TITLE  pull request title; without it the check only reports
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { isBreakingTitle, penvireBreaking, reportBreaking } from './rules.js';

const OUT = path.resolve('build/compat');
const print = (text) => process.stdout.write(`${text}\n`);

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}

function services(root) {
  const dir = path.join(root, 'openapi');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => fs.existsSync(path.join(dir, name, 'openapi.yaml'))).sort();
}

/** Writes the base commit's `openapi/` tree to build/compat/base, keeping relative refs intact. */
function extractBase(ref) {
  const root = path.join(OUT, 'base');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  if (run('git', ['ls-tree', '--name-only', ref, 'openapi']).trim()) {
    execFileSync('tar', ['-x', '-C', root], { input: execFileSync('git', ['archive', ref, 'openapi']) });
  }
  return root;
}

function bundle(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  run('pnpm', ['exec', 'redocly', 'bundle', source, '--dereferenced', '--output', target], { stdio: 'ignore' });
  return target;
}

function compare(name, baseRoot) {
  const dir = path.join(OUT, name);
  const before = bundle(path.join(baseRoot, 'openapi', name, 'openapi.yaml'), path.join(dir, 'base.yaml'));
  const after = bundle(path.join('openapi', name, 'openapi.yaml'), path.join(dir, 'head.yaml'));
  const report = JSON.parse(run('openapi-changes', ['report', '--no-logo', '--reproducible', before, after]));
  fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return [
    ...reportBreaking(report),
    ...penvireBreaking(YAML.parse(fs.readFileSync(before, 'utf8')), YAML.parse(fs.readFileSync(after, 'utf8'))),
  ].map((finding) => `${name}: ${finding}`);
}

const base = process.env.BASE_REF || run('git', ['merge-base', 'origin/main', 'HEAD']).trim();
const baseRoot = extractBase(base);
const current = services('.');
const findings = services(baseRoot).flatMap((name) =>
  current.includes(name) ? compare(name, baseRoot) : [`${name}: service document removed`]);

const compared = services(baseRoot).length;
print(`Compared ${compared} service document${compared === 1 ? "" : "s"} with ${base.slice(0, 12)}.`);
if (findings.length === 0) {
  print('No breaking changes.');
} else {
  print(`Breaking changes:\n${findings.map((finding) => `  - ${finding}`).join('\n')}`);
  const title = process.env.PR_TITLE;
  if (title === undefined) {
    print('A pull request with these changes needs `!` in its title, e.g. `feat(identity)!: …`.');
  } else if (isBreakingTitle(title)) {
    print(`The title marks them as breaking: ${title}`);
  } else {
    console.error(`The title must mark them with \`!\`, e.g. \`feat(identity)!: …\`. Title: ${title}`);
    process.exitCode = 1;
  }
}
