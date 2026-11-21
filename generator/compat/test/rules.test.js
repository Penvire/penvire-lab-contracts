import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isBreakingTitle, penvireBreaking, reportBreaking } from '../rules.js';

const report = JSON.parse(fs.readFileSync(new URL('./report-fixture.json', import.meta.url), 'utf8'));

function document(operation, pathParameters) {
  return { paths: { '/internal/v1/events': { parameters: pathParameters, post: operation } } };
}

const base = {
  operationId: 'recordEvent',
  'x-penvire-audience': 'service',
  'x-penvire-callers': ['engagement', 'evidence'],
  'x-penvire-scopes': ['audit:write'],
  parameters: [{ name: 'dryRun', in: 'query', required: true }, { name: 'trace', in: 'header' }],
};

test('only a `!` before the colon marks a title as breaking', () => {
  assert.equal(isBreakingTitle('feat(identity)!: drop the userinfo endpoint'), true);
  assert.equal(isBreakingTitle('fix!: reject empty scopes'), true);
  assert.equal(isBreakingTitle('feat(identity): add token exchange'), false);
  assert.equal(isBreakingTitle('feat: support ! in names'), false);
  assert.equal(isBreakingTitle(undefined), false);
});

test('breaking changes from openapi-changes become readable lines', () => {
  assert.deepEqual(reportBreaking(report), [
    'object_removed at $.paths (/v1/c)',
    "modified at $.paths['/v1/a'].get.responses['200'].content['application/json'].schema.properties['x'] (type)",
  ]);
  assert.deepEqual(reportBreaking({ message: 'No changes found between specifications' }), []);
});

test('compatible changes to Penvire metadata are not breaking', () => {
  const after = {
    ...base,
    'x-penvire-callers': ['engagement', 'evidence', 'tenant'],
    'x-penvire-scopes': [],
    parameters: [{ name: 'dryRun', in: 'query', required: false }, { name: 'trace', in: 'header' }],
  };
  assert.deepEqual(penvireBreaking(document(base), document(after)), []);
});

test('audience, scope, caller and required-parameter changes are breaking', () => {
  const after = {
    ...base,
    'x-penvire-audience': 'api',
    'x-penvire-callers': ['engagement'],
    'x-penvire-scopes': ['audit:write', 'audit:admin'],
    parameters: [{ name: 'trace', in: 'header', required: true }],
  };
  assert.deepEqual(penvireBreaking(document(base), document(after)), [
    'POST /internal/v1/events: audience changed from service to api',
    'POST /internal/v1/events: requires new scope audit:admin',
    'POST /internal/v1/events: caller evidence no longer allowed',
    'POST /internal/v1/events: parameter header:trace became required',
  ]);
});

test('a path-level parameter that becomes required is breaking', () => {
  const before = document({ ...base, parameters: [] }, [{ name: 'tenant', in: 'header' }]);
  const after = document({ ...base, parameters: [] }, [{ name: 'tenant', in: 'header', required: true }]);
  assert.deepEqual(penvireBreaking(before, after), ['POST /internal/v1/events: parameter header:tenant became required']);
});

test('removed operations are left to openapi-changes', () => {
  assert.deepEqual(penvireBreaking(document(base), { paths: {} }), []);
});
