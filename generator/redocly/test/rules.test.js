import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function lint(file) {
  const result = spawnSync('pnpm', ['exec', 'redocly', 'lint', file, '--config', 'redocly.yaml', '--format', 'json'], {
    cwd: fixtures,
    encoding: 'utf8',
  });
  const output = JSON.parse(result.stdout);
  return output.problems.map((problem) => `${problem.ruleId} ${problem.location[0].pointer}`).sort();
}

test('a document following every rule passes', () => {
  assert.deepEqual(lint('valid.yaml'), []);
});

test('each broken rule is reported at the offending operation', () => {
  assert.deepEqual(lint('invalid.yaml'), [
    'penvire/operation-audience #/paths/~1v1~1no-audience/get',
    'penvire/operation-audience #/paths/~1v1~1no-audience/x-penvire-audience',
    'penvire/operation-callers #/paths/~1internal~1v1~1empty-callers/get/x-penvire-callers',
    'penvire/operation-callers #/paths/~1internal~1v1~1no-callers/get',
    'penvire/operation-callers #/paths/~1internal~1v1~1unknown-caller/get/x-penvire-callers/0',
    'penvire/operation-callers #/paths/~1v1~1api-with-callers/get/x-penvire-callers',
    'penvire/operation-scopes #/paths/~1v1~1empty-scopes/get/x-penvire-scopes',
    'penvire/operation-scopes #/paths/~1v1~1no-scopes/get',
    'penvire/operation-scopes #/paths/~1v1~1token/post/x-penvire-scopes',
    'penvire/operation-scopes #/paths/~1v1~1unknown-scope/get/x-penvire-scopes/0',
    'penvire/path-version #/paths/~1engagements/get',
    'penvire/path-version #/paths/~1v1~1internal-wrong/get',
    'penvire/path-version #/paths/~1v1~1token/post',
  ]);
});
