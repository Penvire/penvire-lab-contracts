import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditRules, dataschemaPattern, eventRules, kebab, missingAuditProducers } from '../rules.js';

const FULL_NAME = 'dev.penvire.lab.identity.events.v1.KeyActivated';

function message(overrides = {}) {
  return {
    contentType: 'application/avro',
    headers: {
      type: 'object',
      required: ['ce_specversion', 'ce_id', 'ce_source', 'ce_type', 'ce_subject', 'ce_time', 'ce_dataschema', 'content-type'],
      properties: {
        ce_source: { const: '/penvire-lab/identity' },
        ce_type: { const: 'dev.penvire.lab.identity.key-activated.v1' },
        ce_dataschema: { type: 'string', pattern: dataschemaPattern(FULL_NAME) },
      },
    },
    payload: {
      schemaFormat: 'application/vnd.apache.avro;version=1.9.0',
      schema: { $ref: `./avro/${FULL_NAME}/2.avsc` },
    },
    bindings: { kafka: { key: { type: 'string' } } },
    ...overrides,
  };
}

function document(msg = message(), address = 'identity.signing-key') {
  return {
    channels: { signingKey: { address, messages: { keyActivated: { $ref: '#/components/messages/KeyActivated' } } } },
    components: { messages: { KeyActivated: msg } },
  };
}

const latest = (revisions) => (fullName) => revisions[fullName];
const onDisk = latest({ [FULL_NAME]: 2 });

function withHeader(key, value) {
  const msg = message();
  msg.headers.properties[key] = value;
  return msg;
}

test('a document following the rules has no problems', () => {
  assert.deepEqual(eventRules('identity', document(), onDisk), []);
});

test('record names become kebab-case event names', () => {
  assert.equal(kebab('SigningKeyActivated'), 'signing-key-activated');
  assert.equal(kebab('UserMFAEnabled'), 'user-mfa-enabled');
  assert.equal(kebab('JWKSRotated'), 'jwks-rotated');
});

test('channels are named after the service and an aggregate', () => {
  assert.deepEqual(eventRules('identity', document(message(), 'tenant.signing-key'), onDisk), [
    'channel signingKey: address must be identity.<aggregate>, e.g. identity.access-token',
  ]);
});

test('channel messages reference component messages', () => {
  const doc = document();
  doc.channels.signingKey.messages.keyActivated = { payload: {} };
  assert.deepEqual(eventRules('identity', doc, onDisk), [
    'channel signingKey: message keyActivated must $ref #/components/messages/…',
  ]);
});

test('every CloudEvents header is required', () => {
  const msg = message();
  msg.headers.required = msg.headers.required.filter((key) => key !== 'ce_dataschema' && key !== 'ce_time');
  assert.deepEqual(eventRules('identity', document(msg), onDisk), [
    'message KeyActivated: headers must require ce_time, ce_dataschema',
  ]);
});

test('ce_source is the service', () => {
  assert.deepEqual(eventRules('identity', document(withHeader('ce_source', { const: '/penvire-lab/tenant' })), onDisk), [
    'message KeyActivated: ce_source must be const /penvire-lab/identity',
  ]);
});

test('ce_type names the service, the event and its major', () => {
  assert.deepEqual(eventRules('identity', document(withHeader('ce_type', { const: 'KeyActivated' })), onDisk), [
    'message KeyActivated: ce_type must be const dev.penvire.lab.identity.<event>.v<major>',
  ]);
});

test('ce_type matches the schema name and major', () => {
  const problems = eventRules(
    'identity', document(withHeader('ce_type', { const: 'dev.penvire.lab.identity.key-rotated.v2' })), onDisk);
  assert.deepEqual(problems, [
    'message KeyActivated: ce_type major v2 differs from schema major v1',
    'message KeyActivated: ce_type event key-rotated must be key-activated',
  ]);
});

test('the payload is the latest Avro revision of a service schema', () => {
  assert.deepEqual(eventRules('identity', document(), latest({ [FULL_NAME]: 3 })), [
    `message KeyActivated: must reference the latest revision 3 of ${FULL_NAME}, not 2`,
  ]);
  assert.deepEqual(eventRules('identity', document(), latest({})), [
    `message KeyActivated: schema ${FULL_NAME} has no revisions`,
  ]);
  const json = message({ payload: { schemaFormat: 'application/schema+json', schema: { type: 'object' } } });
  assert.deepEqual(eventRules('identity', document(json), onDisk), [
    'message KeyActivated: payload.schemaFormat must be application/vnd.apache.avro;version=…',
    'message KeyActivated: payload.schema must $ref ./avro/<full name>/<revision>.avsc',
  ]);
});

test('schemas live in the service namespace', () => {
  const other = 'dev.penvire.lab.tenant.events.v1.KeyActivated';
  const msg = message({ payload: { schemaFormat: 'application/vnd.apache.avro;version=1.9.0', schema: { $ref: `./avro/${other}/1.avsc` } } });
  msg.headers.properties.ce_dataschema.pattern = dataschemaPattern(other);
  assert.deepEqual(eventRules('identity', document(msg), latest({ [other]: 1 })), [
    `message KeyActivated: schema ${other} must be named dev.penvire.lab.identity.events.v<major>.<RecordName>`,
  ]);
});

test('ce_dataschema accepts every revision of the payload schema', () => {
  assert.equal(new RegExp(dataschemaPattern(FULL_NAME)).test(`urn:penvire-lab:schema:${FULL_NAME}:12`), true);
  assert.equal(new RegExp(dataschemaPattern(FULL_NAME)).test(`urn:penvire-lab:schema:${FULL_NAME}:0`), false);
  assert.deepEqual(eventRules('identity', document(withHeader('ce_dataschema', { type: 'string' })), onDisk), [
    `message KeyActivated: ce_dataschema must have pattern '${dataschemaPattern(FULL_NAME)}'`,
  ]);
});

test('Avro content type and a Kafka record key', () => {
  assert.deepEqual(eventRules('identity', document(message({ contentType: 'application/json', bindings: {} })), onDisk), [
    'message KeyActivated: contentType must be application/avro',
    'message KeyActivated: bindings.kafka.key must describe the record key (the aggregate ID)',
  ]);
});

const SHARED_AUDIT = {
  type: 'record',
  name: 'AuditRecorded',
  fields: [
    { name: 'action', type: 'string' },
    { name: 'outcome', type: { type: 'enum', name: 'AuditOutcome', symbols: ['SUCCESS', 'DENIED', 'FAILED'] } },
  ],
};
const AUDIT_NAMESPACE = 'dev.penvire.lab.identity.events.v1';
const auditCopy = (overrides = {}) => ({ namespace: AUDIT_NAMESPACE, ...structuredClone(SHARED_AUDIT), ...overrides });

function auditDocument() {
  const doc = document();
  doc.channels.audit = { address: 'identity.audit', messages: { auditRecorded: { $ref: '#/components/messages/AuditRecorded' } } };
  doc.components.messages.AuditRecorded = {};
  return doc;
}

test('a service sending AuditRecorded on its audit channel has no audit problems', () => {
  assert.deepEqual(auditRules('identity', auditDocument(), SHARED_AUDIT, auditCopy()), []);
});

test('every service has one audit channel and defines AuditRecorded', () => {
  assert.deepEqual(auditRules('identity', document(), SHARED_AUDIT, auditCopy()), [
    'channels: exactly one channel must have address identity.audit, found 0',
    'components.messages: must define AuditRecorded',
  ]);
});

test('the audit channel carries AuditRecorded alone, and nothing else carries it', () => {
  const doc = auditDocument();
  doc.channels.audit.messages.keyActivated = { $ref: '#/components/messages/KeyActivated' };
  doc.channels.signingKey.messages.auditRecorded = { $ref: '#/components/messages/AuditRecorded' };
  assert.deepEqual(auditRules('identity', doc, SHARED_AUDIT, auditCopy()), [
    'channel signingKey: AuditRecorded may only be sent on identity.audit',
    'channel audit: identity.audit must carry AuditRecorded and nothing else',
  ]);
});

test('the latest AuditRecorded revision is the shared definition in the service namespace', () => {
  const differs = 'schema dev.penvire.lab.identity.events.v1.AuditRecorded: the latest revision differs from '
    + 'asyncapi/audit-recorded.avsc; add a revision that copies it, with only the namespace added';
  const reordered = auditCopy();
  reordered.fields[1].type = { symbols: ['SUCCESS', 'DENIED', 'FAILED'], name: 'AuditOutcome', type: 'enum' };
  assert.deepEqual(auditRules('identity', auditDocument(), SHARED_AUDIT, reordered), []);

  const extraSymbol = auditCopy();
  extraSymbol.fields[1].type.symbols.push('SKIPPED');
  assert.deepEqual(auditRules('identity', auditDocument(), SHARED_AUDIT, extraSymbol), [differs]);
  assert.deepEqual(auditRules('identity', auditDocument(), SHARED_AUDIT, auditCopy({ doc: 'Mine.' })), [differs]);
  assert.deepEqual(
    auditRules('identity', auditDocument(), SHARED_AUDIT, auditCopy({ namespace: 'dev.penvire.lab.tenant.events.v1' })),
    [differs]);
  assert.deepEqual(auditRules('identity', auditDocument(), SHARED_AUDIT, undefined), [
    'schema dev.penvire.lab.identity.events.v1.AuditRecorded has no revisions',
  ]);
});

test('every service with an OpenAPI document has an AsyncAPI document for its audit events', () => {
  assert.deepEqual(missingAuditProducers(['identity'], ['identity']), []);
  assert.deepEqual(missingAuditProducers(['identity', 'tenant'], ['identity']), [
    'asyncapi/tenant/asyncapi.yaml is missing: every service records audit events (ADR 0006), '
      + "so it needs an AsyncAPI document with an audit channel; copy Identity's",
  ]);
});
