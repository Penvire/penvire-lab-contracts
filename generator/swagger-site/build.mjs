import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { bundle, extractOpenapiTree, print, run } from '../lib/tools.mjs';

const output = path.resolve('build/swagger-site');
const here = (file) => new URL(`./${file}`, import.meta.url);
const require = createRequire(import.meta.url);

const ICONS = {
  moon: '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  sun: '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
};

function releaseTags() {
  const tags = run('git', ['tag', '--list', 'openapi-*-v*', '--sort=-version:refname']);
  return tags.split('\n').flatMap((tag) => {
    const match = /^openapi-([a-z0-9]+(?:-[a-z0-9]+)*)-v(\d+\.\d+\.\d+)$/.exec(tag);
    return match ? [{ tag, service: match[1], version: match[2] }] : [];
  });
}

/** The shared top bar. `home` is the relative path to the landing page; `crumbs` and `actions` are HTML. */
function header(home, crumbs = '', actions = '') {
  return `<header class="site-header">
  <div class="container">
    <a class="brand" href="${home}"><span class="brand-mark">P</span>Penvire Lab <span class="brand-sub">API reference</span></a>
    ${crumbs}
    <div class="header-actions">
      ${actions}
      <button class="button icon-button" type="button" data-theme-toggle>${ICONS.moon}${ICONS.sun}</button>
    </div>
  </div>
</header>`;
}

function serviceCard(service, releases) {
  const [latest, ...older] = releases;
  const olderLinks = older.map(({ tag, version }) => `<li><a href="./${tag}/">v${version}</a></li>`).join('');
  return `<article class="service">
      <div class="service-head">
        <h2>${service}</h2>
        <span class="badge">v${latest.version}</span>
      </div>
      <div class="service-actions">
        <a class="button primary" href="./${latest.tag}/">Open reference</a>
        <a class="button" href="./${latest.tag}/openapi.yaml" download>${ICONS.download}YAML</a>
      </div>
      ${older.length ? `<div class="older"><span class="older-label">Earlier</span><ul>${olderLinks}</ul></div>` : ''}
    </article>`;
}

function indexPage(releases) {
  const byService = Map.groupBy(releases, ({ service }) => service);
  const cards = [...byService.keys()].sort().map((service) => serviceCard(service, byService.get(service)));
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Penvire Lab API reference</title>
<script src="./assets/theme.js"></script>
<link rel="stylesheet" href="./assets/site.css">
${header('./')}
<main class="container">
  <section class="hero">
    <h1>API reference</h1>
    <p>Released OpenAPI contracts of the Penvire Lab services, read-only in Swagger UI. Every release keeps its own page and bundled YAML.</p>
  </section>
  ${cards.length ? `<section class="services">\n    ${cards.join('\n    ')}\n  </section>` : '<p class="empty">No OpenAPI contracts have been released yet.</p>'}
</main>
<footer class="site-footer"><div class="container"><a href="https://github.com/Penvire/penvire-lab-contracts">penvire-lab-contracts</a> · a learning project, never in production</div></footer>
</html>
`;
}

function versionPage(template, { service, version }) {
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><span>/</span><strong>${service}</strong><span class="badge">v${version}</span></nav>`;
  const actions = `<a class="button" href="../">All releases</a><a class="button" href="./openapi.yaml" download>${ICONS.download}YAML</a>`;
  return template
    .replaceAll('{{service}}', service)
    .replaceAll('{{version}}', version)
    .replace('{{header}}', header('../', crumbs, actions));
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'LICENSE', 'NOTICE']) {
  fs.copyFileSync(require.resolve(`swagger-ui-dist/${asset}`), path.join(output, 'assets', asset));
}
for (const asset of ['site.css', 'theme.js']) fs.copyFileSync(here(asset), path.join(output, 'assets', asset));

const template = fs.readFileSync(here('version.html'), 'utf8');
const releases = releaseTags();
for (const release of releases) {
  const root = extractOpenapiTree(release.tag, path.resolve('build/swagger-site-source'));
  const dir = path.join(output, release.tag);
  bundle(path.join(root, 'openapi', release.service, 'openapi.yaml'), path.join(dir, 'openapi.yaml'));
  fs.writeFileSync(path.join(dir, 'index.html'), versionPage(template, release));
}
fs.writeFileSync(path.join(output, 'index.html'), indexPage(releases));
print(`Built ${releases.length} OpenAPI release pages in ${path.relative('.', output)}`);
