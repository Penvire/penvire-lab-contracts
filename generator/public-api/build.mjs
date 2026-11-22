// Builds build/public-api/public-api.yaml from every service's `api` and `protocol` operations (ADR 0001),
// and build/public-api/client.yaml, the same without `protocol` operations, for @penvire-lab/api-client.
//
//   node generator/public-api/build.mjs released   each service at its last release tag (for publishing)
//   node generator/public-api/build.mjs head       the working tree (for pull request checks)
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { bundle, extractOpenapiTree, highestVersion, print, run, services } from '../lib/tools.mjs';
import { clientDocument, mergePublicApi } from './merge.js';

const OUT = path.resolve('build/public-api');
const source = process.argv[2] ?? 'head';
if (!['head', 'released'].includes(source)) throw new Error(`Unknown source ${source}; use head or released`);

/** `{ service: version }` of the last release tag of each service document. */
function releasedVersions() {
  const byService = {};
  for (const tag of run('git', ['tag', '--list', 'openapi-*-v*']).split('\n').filter(Boolean)) {
    const [, service, version] = tag.match(/^openapi-(.+)-v(\d+\.\d+\.\d+)$/) ?? [];
    if (service) (byService[service] ??= []).push(version);
  }
  return Object.fromEntries(Object.entries(byService).map(([service, versions]) => [service, highestVersion(versions)]));
}

/** `[{ name, root, version }]`: where each service document to merge lives. */
function inputs() {
  if (source === 'head') return services('.').map((name) => ({ name, root: '.', version: 'working tree' }));
  return Object.entries(releasedVersions()).sort().map(([name, version]) => ({
    name,
    version,
    root: extractOpenapiTree(`openapi-${name}-v${version}`, path.join(OUT, 'released', name)),
  }));
}

const config = YAML.parse(fs.readFileSync('generator/public-api/config.yaml', 'utf8'));
const documents = inputs().map(({ name, root, version }) => {
  const bundled = bundle(path.join(root, 'openapi', name, 'openapi.yaml'), path.join(OUT, 'services', `${name}.yaml`));
  print(`${name}: ${version}`);
  return { name, document: YAML.parse(fs.readFileSync(bundled, 'utf8')) };
});

const merged = path.join(OUT, 'merged.yaml');
fs.writeFileSync(merged, YAML.stringify(mergePublicApi(documents, config)));
const output = bundle(merged, path.join(OUT, 'public-api.yaml'), ['--remove-unused-components']);
const publicApi = YAML.parse(fs.readFileSync(output, 'utf8'));
fs.writeFileSync(path.join(OUT, 'client.yaml'), YAML.stringify(clientDocument(publicApi)));
const paths = Object.keys(publicApi.paths ?? {}).length;
print(`public-api: ${paths} path${paths === 1 ? '' : 's'} from ${documents.length} service${documents.length === 1 ? '' : 's'} → ${path.relative('.', output)}`);
