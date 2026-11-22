// Validates every asyncapi/<service>/asyncapi.yaml with the AsyncAPI parser and checks the
// Penvire event rules and the recorded generator hash. Avro schemas themselves are checked by the
// Gradle build (generator/avro), with the same Avro library the services decode with.
//
//   --update-generator-hash  rewrite asyncapi/<service>/generator.sha256 after a generator change
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { Parser, fromFile } from '@asyncapi/parser';
import { AvroSchemaParser } from '@asyncapi/avro-schema-parser';
import { eventServices, print } from '../lib/tools.mjs';
import { GENERATOR_SOURCES, generatorHash, staleServices } from './generator-hash.js';
import { eventRules } from './rules.js';

const ERROR = 0;

const parser = new Parser();
parser.registerSchemaParser(AvroSchemaParser());

function latestRevisions(service) {
  return (fullName) => {
    const dir = path.join('asyncapi', service, 'avro', fullName);
    if (!fs.existsSync(dir)) return undefined;
    const revisions = fs.readdirSync(dir)
      .map((file) => /^([1-9][0-9]*)\.avsc$/.exec(file)?.[1])
      .filter(Boolean)
      .map(Number);
    return revisions.length > 0 ? Math.max(...revisions) : undefined;
  };
}

function generatorFiles() {
  return GENERATOR_SOURCES.flatMap((source) => {
    const files = fs.statSync(source).isDirectory()
      ? fs.readdirSync(source, { recursive: true }).map((file) => path.join(source, file))
      : [source];
    return files.filter((file) => fs.statSync(file).isFile())
      .map((file) => ({ path: file, content: fs.readFileSync(file, 'utf8') }));
  });
}

const services = eventServices('.');
const hashFile = (service) => path.join('asyncapi', service, 'generator.sha256');
const currentHash = generatorHash(generatorFiles());

if (process.argv.includes('--update-generator-hash')) {
  for (const service of services) fs.writeFileSync(hashFile(service), `${currentHash}\n`);
  print(`Recorded generator hash ${currentHash.slice(0, 12)} for ${services.join(', ')}.`);
  process.exit(0);
}

const recorded = Object.fromEntries(services.map((service) =>
  [service, fs.existsSync(hashFile(service)) ? fs.readFileSync(hashFile(service), 'utf8') : undefined]));
const stale = new Set(staleServices(recorded, currentHash));

let failed = false;
for (const service of services) {
  const file = path.join('asyncapi', service, 'asyncapi.yaml');
  const { diagnostics } = await fromFile(parser, file).parse();
  const problems = diagnostics
    .filter((diagnostic) => diagnostic.severity === ERROR)
    .map((diagnostic) => `${diagnostic.message} at #/${diagnostic.path.join('/')}`);
  problems.push(...eventRules(service, YAML.parse(fs.readFileSync(file, 'utf8')), latestRevisions(service)));
  if (stale.has(service)) {
    problems.push(`${hashFile(service)} is out of date: the generator changed, so ${service}-events must be released. `
      + 'Run `pnpm run events:generator-hash` and commit with a `fix` or `feat` title.');
  }
  if (problems.length > 0) {
    failed = true;
    console.error(`${file}:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  } else {
    print(`${file}: valid`);
  }
}
if (failed) process.exitCode = 1;
