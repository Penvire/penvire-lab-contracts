import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePublicApi, prefixRefs } from '../merge.js';
import { classify, nextVersion } from '../version.js';

const config = {
  title: 'Public',
  description: 'All api operations',
  serverUrl: 'https://api.example.test',
  openIdConnectUrl: 'https://api.example.test/.well-known/openid-configuration',
};

const engagement = {
  paths: {
    '/v1/t/{tenantId}/engagements': {
      parameters: [{ name: 'tenantId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'listEngagements',
        'x-penvire-audience': 'api',
        'x-penvire-scopes': ['engagement:read'],
        servers: [{ url: 'https://engagement.internal' }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Engagement' } } } } },
      },
    },
    '/internal/v1/engagements': {
      get: { operationId: 'listAllEngagements', 'x-penvire-audience': 'service', responses: { 200: { description: 'OK' } } },
    },
  },
  components: {
    schemas: { Engagement: { type: 'object', properties: { owner: { $ref: '#/components/schemas/Owner' } } }, Owner: { type: 'string' } },
    securitySchemes: { internal: { type: 'http', scheme: 'bearer' } },
  },
};

const identity = {
  paths: {
    '/.well-known/openid-configuration': { get: { operationId: 'discovery', 'x-penvire-audience': 'protocol', responses: { 200: { description: 'OK' } } } },
  },
  components: { schemas: { Owner: { type: 'integer' } } },
};

test('only api operations are merged, with public security and the scopes they need', () => {
  const merged = mergePublicApi([{ name: 'identity', document: identity }, { name: 'engagement', document: engagement }], config);
  assert.deepEqual(Object.keys(merged.paths), ['/v1/t/{tenantId}/engagements']);
  const operation = merged.paths['/v1/t/{tenantId}/engagements'].get;
  assert.deepEqual(operation.security, [{ openIdConnect: ['engagement:read'] }, { apiToken: ['engagement:read'] }]);
  assert.equal(operation.servers, undefined);
  assert.equal(merged.paths['/v1/t/{tenantId}/engagements'].parameters[0].name, 'tenantId');
  assert.deepEqual(merged.servers, [{ url: 'https://api.example.test' }]);
  assert.deepEqual(Object.keys(merged.components.securitySchemes), ['openIdConnect', 'apiToken']);
});

test('component names are prefixed per service, so equal names do not collide', () => {
  const merged = mergePublicApi([{ name: 'identity', document: identity }, { name: 'engagement', document: engagement }], config);
  assert.deepEqual(Object.keys(merged.components.schemas).sort(), ['EngagementEngagement', 'EngagementOwner', 'IdentityOwner']);
  assert.equal(merged.components.schemas.EngagementEngagement.properties.owner.$ref, '#/components/schemas/EngagementOwner');
  const schema = merged.paths['/v1/t/{tenantId}/engagements'].get.responses[200].content['application/json'].schema;
  assert.equal(schema.$ref, '#/components/schemas/EngagementEngagement');
});

test('discriminator mappings are prefixed too', () => {
  const renamed = prefixRefs({ discriminator: { propertyName: 'kind', mapping: { a: '#/components/schemas/A' } } }, 'Tenant');
  assert.deepEqual(renamed.discriminator.mapping, { a: '#/components/schemas/TenantA' });
});

test('a path or operationId claimed by two services is rejected', () => {
  const copy = structuredClone(engagement);
  assert.throws(() => mergePublicApi([{ name: 'engagement', document: engagement }, { name: 'evidence', document: copy }], config), /declared by both/);
  const renamedPath = structuredClone(engagement);
  renamedPath.paths = { '/v1/other': renamedPath.paths['/v1/t/{tenantId}/engagements'] };
  assert.throws(() => mergePublicApi([{ name: 'engagement', document: engagement }, { name: 'evidence', document: renamedPath }], config), /operationId listEngagements/);
});

test('a document without api operations has no paths', () => {
  assert.deepEqual(mergePublicApi([{ name: 'identity', document: identity }], config).paths, {});
});

test('changes are classified from the report and the Penvire findings', () => {
  assert.deepEqual(classify({ message: 'No changes found between specifications' }), { changed: false, breaking: false, added: false });
  assert.deepEqual(classify({ changes: [{ breaking: false, changeText: 'object_added' }] }), { changed: true, breaking: false, added: true });
  assert.deepEqual(classify({ changes: [{ breaking: false, changeText: 'modified' }] }), { changed: true, breaking: false, added: false });
  assert.deepEqual(classify({ changes: [] }, ['GET /v1/x: requires new scope a:b']), { changed: true, breaking: true, added: false });
});

test('versions follow the 0.x and 1.x rules', () => {
  const none = { changed: false, breaking: false, added: false };
  const breaking = { changed: true, breaking: true, added: true };
  const added = { changed: true, breaking: false, added: true };
  const other = { changed: true, breaking: false, added: false };
  assert.equal(nextVersion('0.3.2', none), null);
  assert.equal(nextVersion(null, added), '0.1.0');
  assert.equal(nextVersion('0.3.2', breaking), '0.4.0');
  assert.equal(nextVersion('0.3.2', added), '0.3.3');
  assert.equal(nextVersion('0.3.2', other), '0.3.3');
  assert.equal(nextVersion('2.3.4', breaking), '3.0.0');
  assert.equal(nextVersion('2.3.4', added), '2.4.0');
  assert.equal(nextVersion('2.3.4', other), '2.3.5');
});
