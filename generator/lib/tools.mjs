// Shared helpers for the contract scripts: processes, git trees, Redocly and openapi-changes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const print = (text) => process.stdout.write(`${text}\n`);

export function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}

/** Service names with an `openapi/<name>/openapi.yaml` below `root`. */
export function services(root) {
  const dir = path.join(root, 'openapi');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => fs.existsSync(path.join(dir, name, 'openapi.yaml'))).sort();
}

/** Writes `ref`'s `openapi/` tree to `target`, keeping relative refs intact. */
export function extractOpenapiTree(ref, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  if (run('git', ['ls-tree', '--name-only', ref, 'openapi']).trim()) {
    execFileSync('tar', ['-x', '-C', target], { input: execFileSync('git', ['archive', ref, 'openapi']) });
  }
  return target;
}

/** Bundles a document into one file with Redocly; extra flags such as `--dereferenced` pass through. */
export function bundle(source, target, flags = []) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  run('pnpm', ['exec', 'redocly', 'bundle', source, ...flags, '--output', target], { stdio: 'ignore' });
  return target;
}

/** `openapi-changes report` between two files, as parsed JSON. */
export function changesReport(before, after) {
  return JSON.parse(run('openapi-changes', ['report', '--no-logo', '--reproducible', before, after]));
}

/** Highest stable semantic version in a list, or null. */
export function highestVersion(versions) {
  const parse = (version) => version.split('.').map(Number);
  return versions
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => {
      const [x, y] = [parse(a), parse(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    })
    .at(-1) ?? null;
}
