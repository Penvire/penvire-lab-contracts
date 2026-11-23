import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAvro } from '../events.mjs';

test('nested records and enums are listed as named types with their fields', () => {
  const { named } = describeAvro({
    type: 'record',
    name: 'AuditRecorded',
    namespace: 'dev.penvire.lab.identity.events.v1',
    fields: [
      { name: 'outcome', type: { type: 'enum', name: 'AuditOutcome', symbols: ['SUCCESS', 'DENIED'] }, doc: 'How it ended.' },
      { name: 'actorId', type: ['null', 'string'] },
      { name: 'changes', type: { type: 'array', items: { type: 'record', name: 'AuditChange', fields: [{ name: 'fieldPath', type: 'string' }] } }, default: [] },
      { name: 'again', type: 'AuditOutcome' },
    ],
  });
  assert.deepEqual(named.map(({ name, kind }) => [name, kind]), [
    ['dev.penvire.lab.identity.events.v1.AuditRecorded', 'record'],
    ['dev.penvire.lab.identity.events.v1.AuditOutcome', 'enum'],
    ['dev.penvire.lab.identity.events.v1.AuditChange', 'record'],
  ]);
  const [record, outcome] = named;
  assert.deepEqual(outcome.symbols, ['SUCCESS', 'DENIED']);
  assert.deepEqual(record.fields.map(({ name, optional }) => [name, optional]),
    [['outcome', false], ['actorId', true], ['changes', false], ['again', false]]);
  assert.equal(record.fields[1].type, '<code>null</code> | <code>string</code>');
  assert.match(record.fields[2].type, /^array&lt;<a href="#type-dev-penvire-lab-identity-events-v1-AuditChange">/);
  assert.match(record.fields[3].type, /href="#type-dev-penvire-lab-identity-events-v1-AuditOutcome"/);
  assert.deepEqual(record.fields[2].default, []);
});

test('logical types are shown next to their encoded type', () => {
  const { type } = describeAvro({ type: 'long', logicalType: 'timestamp-millis' });
  assert.equal(type, '<code>long</code> <span class="muted">timestamp-millis</span>');
});
