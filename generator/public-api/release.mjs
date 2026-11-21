// Decides whether build/public-api/public-api.yaml is a new release, and which version.
// The last published dev.penvire.lab:public-api on Forgejo is the baseline (ADR 0001).
// Writes `release` and `version` to $GITHUB_OUTPUT and stamps info.version.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { penvireBreaking } from '../compat/rules.js';
import { changesReport, highestVersion, print } from '../lib/tools.mjs';
import { classify, nextVersion } from './version.js';

const OUT = path.resolve('build/public-api');
const ARTIFACT = 'dev.penvire.lab:public-api';

const mavenUrl = fs.readFileSync('gradle.properties', 'utf8').match(/^forgejoMavenUrl=(.+)$/m)?.[1];
const [, forgejo, owner] = mavenUrl?.match(/^(https:\/\/[^/]+)\/api\/packages\/([^/]+)\/maven$/) ?? [];
if (!forgejo) throw new Error(`gradle.properties: forgejoMavenUrl must look like https://<host>/api/packages/<owner>/maven, got ${mavenUrl}`);

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url}: ${response.status}`);
  return response;
}

async function publishedVersion() {
  const url = `${forgejo}/api/v1/packages/${owner}?type=maven&q=public-api&limit=50`;
  const packages = await (await fetchOk(url)).json();
  return highestVersion(packages.filter((item) => item.name === ARTIFACT).map((item) => item.version));
}

/** Writes a copy with a neutral info.version, so the version itself is never a difference. */
function neutral(document, file) {
  fs.writeFileSync(file, YAML.stringify({ ...document, info: { ...document.info, version: '0.0.0' } }));
  return file;
}

const current = YAML.parse(fs.readFileSync(path.join(OUT, 'public-api.yaml'), 'utf8'));
const previousVersion = await publishedVersion();
let summary;
if (previousVersion) {
  const previousUrl = `${mavenUrl}/dev/penvire/lab/public-api/${previousVersion}/public-api-${previousVersion}.yaml`;
  const previous = YAML.parse(await (await fetchOk(previousUrl)).text());
  const report = changesReport(neutral(previous, path.join(OUT, 'previous.yaml')), neutral(current, path.join(OUT, 'current.yaml')));
  fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  summary = classify(report, penvireBreaking(previous, current));
} else {
  const hasPaths = Object.keys(current.paths ?? {}).length > 0;
  summary = { changed: hasPaths, breaking: false, added: hasPaths };
}

const version = nextVersion(previousVersion, summary);
print(`public-api: published ${previousVersion ?? 'never'}; ${JSON.stringify(summary)} → ${version ?? 'no release'}`);
if (version) {
  fs.writeFileSync(path.join(OUT, 'public-api.yaml'), YAML.stringify({ ...current, info: { ...current.info, version } }));
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `release=${version !== null}\nversion=${version ?? ''}\n`);
}
