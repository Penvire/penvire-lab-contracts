// Breaking-change check (ADR 0001). Compares every service document with the pull
// request's base and fails when something breaks but the PR title has no `!`.
//
//   BASE_REF  commit to compare with (default: merge base with origin/main)
//   PR_TITLE  pull request title; without it the check only reports
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { bundle, changesReport, extractOpenapiTree, print, run, services } from '../lib/tools.mjs';
import { isBreakingTitle, penvireBreaking, reportBreaking } from './rules.js';

const OUT = path.resolve('build/compat');

function compare(name, baseRoot) {
  const dir = path.join(OUT, name);
  const before = bundle(path.join(baseRoot, 'openapi', name, 'openapi.yaml'), path.join(dir, 'base.yaml'), ['--dereferenced']);
  const after = bundle(path.join('openapi', name, 'openapi.yaml'), path.join(dir, 'head.yaml'), ['--dereferenced']);
  const report = changesReport(before, after);
  fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return [
    ...reportBreaking(report),
    ...penvireBreaking(YAML.parse(fs.readFileSync(before, 'utf8')), YAML.parse(fs.readFileSync(after, 'utf8'))),
  ].map((finding) => `${name}: ${finding}`);
}

const base = process.env.BASE_REF || run('git', ['merge-base', 'origin/main', 'HEAD']).trim();
const baseRoot = extractOpenapiTree(base, path.join(OUT, 'base'));
const current = services('.');
const findings = services(baseRoot).flatMap((name) =>
  current.includes(name) ? compare(name, baseRoot) : [`${name}: service document removed`]);

const compared = services(baseRoot).length;
print(`Compared ${compared} service document${compared === 1 ? '' : 's'} with ${base.slice(0, 12)}.`);
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
