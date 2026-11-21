// Turns the generated typescript-fetch sources into the @penvire-lab/api-client npm package.
//
//   node generator/public-api/package-client.mjs [version]
// Compiles build/public-api/ts to ESM with declarations and packs it into build/public-api/npm.
import fs from 'node:fs';
import path from 'node:path';
import { print, run } from '../lib/tools.mjs';

const OUT = path.resolve('build/public-api');
const sources = path.join(OUT, 'ts');
const version = process.argv[2] ?? '0.0.0';

const write = (file, value) => fs.writeFileSync(path.join(sources, file), `${JSON.stringify(value, null, 2)}\n`);

write('package.json', {
  name: '@penvire-lab/api-client',
  version,
  description: 'TypeScript fetch client for the Penvire Lab public API.',
  license: 'Apache-2.0',
  type: 'module',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  main: './dist/index.js',
  types: './dist/index.d.ts',
  files: ['dist'],
  sideEffects: false,
});
write('tsconfig.json', {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    lib: ['ES2022', 'DOM'],
    declaration: true,
    strict: true,
    skipLibCheck: true,
    rootDir: 'src',
    outDir: 'dist',
  },
  include: ['src/**/*.ts'],
});

run(path.resolve('node_modules/.bin/tsc'), ['-p', sources], { stdio: 'inherit' });
const npm = path.join(OUT, 'npm');
fs.rmSync(npm, { recursive: true, force: true });
fs.mkdirSync(npm, { recursive: true });
run('pnpm', ['pack', '--pack-destination', npm], { cwd: sources, stdio: 'ignore' });
print(`@penvire-lab/api-client ${version} → ${path.relative('.', path.join(npm, fs.readdirSync(npm)[0]))}`);
