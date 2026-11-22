import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { bundle, extractOpenapiTree, print, run } from '../lib/tools.mjs';

const output = path.resolve('build/swagger-site');
const versionPage = new URL('./version.html', import.meta.url);
const require = createRequire(import.meta.url);

function releaseTags() {
  const tags = run('git', ['tag', '--list', 'openapi-*-v*', '--sort=-version:refname']);
  return tags.split('\n').flatMap((tag) => {
    const match = /^openapi-([a-z0-9]+(?:-[a-z0-9]+)*)-v(\d+\.\d+\.\d+)$/.exec(tag);
    return match ? [{ tag, service: match[1], version: match[2] }] : [];
  });
}

function indexPage(releases) {
  const byService = Map.groupBy(releases, ({ service }) => service);
  const sections = [...byService.keys()].sort().map((service) => {
    const links = byService.get(service).map(({ tag, version }, index) =>
      `<li><a href="./${tag}/">${service} v${version}</a>${index === 0 ? ' (latest)' : ''}</li>`);
    return `<section><h2>${service}</h2><ul>${links.join('')}</ul></section>`;
  });
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Penvire Lab API reference</title>
<main>
  <h1>Penvire Lab API reference</h1>
  <p>Browse released OpenAPI contracts in read-only Swagger UI.</p>
  ${sections.join('\n  ') || '<p>No OpenAPI contracts have been released yet.</p>'}
</main>
</html>
`;
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'LICENSE', 'NOTICE']) {
  fs.copyFileSync(require.resolve(`swagger-ui-dist/${asset}`), path.join(output, 'assets', asset));
}

const releases = releaseTags();
for (const { tag, service } of releases) {
  const root = extractOpenapiTree(tag, path.resolve('build/swagger-site-source'));
  const dir = path.join(output, tag);
  bundle(path.join(root, 'openapi', service, 'openapi.yaml'), path.join(dir, 'openapi.yaml'));
  fs.copyFileSync(versionPage, path.join(dir, 'index.html'));
}
fs.writeFileSync(path.join(output, 'index.html'), indexPage(releases));
print(`Built ${releases.length} OpenAPI release pages in ${path.relative('.', output)}`);
