// Breaking-change check (ADRs 0001 and 0004). Compares every service document and AsyncAPI
// document with the pull request's base and fails when something breaks but the PR title has
// no `!`. A changed or deleted schema revision always fails: consumers decode old events with it.
//
//   BASE_REF  commit to compare with (default: merge base with origin/main)
//   PR_TITLE  pull request title; without it the check only reports
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { bundle, changesReport, eventServices, extractTree, print, run, services } from '../lib/tools.mjs';
import { changedRevisions, eventBreaking } from './events.js';
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

const asyncapi = (root, name) => YAML.parse(fs.readFileSync(path.join(root, 'asyncapi', name, 'asyncapi.yaml'), 'utf8'));

const compareEvents = (name, baseRoot) =>
  eventBreaking(asyncapi(baseRoot, name), asyncapi('.', name)).map((finding) => `${name} events: ${finding}`);

/** Map of `asyncapi/<service>/avro/<full name>/<revision>.avsc` → content below `root`. */
function revisions(root) {
  const result = new Map();
  const dir = path.join(root, 'asyncapi');
  if (!fs.existsSync(dir)) return result;
  for (const file of fs.readdirSync(dir, { recursive: true })) {
    if (/^[^/]+\/avro\/[^/]+\/[^/]+\.avsc$/.test(file)) {
      result.set(path.join('asyncapi', file), fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  }
  return result;
}

const base = process.env.BASE_REF || run('git', ['merge-base', 'origin/main', 'HEAD']).trim();
const baseRoot = extractTree(base, path.join(OUT, 'base'), ['openapi', 'asyncapi']);

const current = services('.');
const findings = services(baseRoot).flatMap((name) =>
  current.includes(name) ? compare(name, baseRoot) : [`${name}: service document removed`]);
const currentEvents = eventServices('.');
findings.push(...eventServices(baseRoot).flatMap((name) =>
  currentEvents.includes(name) ? compareEvents(name, baseRoot) : [`${name}: AsyncAPI document removed`]));
const frozen = changedRevisions(revisions(baseRoot), revisions('.'));

const compared = services(baseRoot).length + eventServices(baseRoot).length;
print(`Compared ${compared} document${compared === 1 ? '' : 's'} with ${base.slice(0, 12)}.`);
if (frozen.length > 0) {
  console.error(`Schema revisions are immutable; add a new revision instead:\n${frozen.map((file) => `  - ${file}`).join('\n')}`);
  process.exitCode = 1;
}
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
