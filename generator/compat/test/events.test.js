import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedRevisions, eventBreaking } from '../events.js';

const ACTIVATED = 'dev.penvire.lab.identity.signing-key-activated.v1';
const RETIRED = 'dev.penvire.lab.identity.signing-key-retired.v1';

function message(type) {
  return { headers: { properties: { ce_type: { const: type } } } };
}

function document(channels) {
  const messages = {};
  const result = { channels: {}, components: { messages } };
  for (const [address, types] of Object.entries(channels)) {
    result.channels[address] = { address, messages: {} };
    for (const type of types) {
      messages[type] = message(type);
      result.channels[address].messages[type] = { $ref: `#/components/messages/${type}` };
    }
  }
  return result;
}

test('adding events and channels is not breaking', () => {
  const before = document({ 'identity.signing-key': [ACTIVATED] });
  const after = document({ 'identity.signing-key': [ACTIVATED, RETIRED], 'identity.user': [] });
  assert.deepEqual(eventBreaking(before, after), []);
});

test('a removed channel or event breaks consumers', () => {
  const before = document({ 'identity.signing-key': [ACTIVATED, RETIRED], 'identity.user': [] });
  const after = document({ 'identity.signing-key': [ACTIVATED] });
  assert.deepEqual(eventBreaking(before, after), [
    `${RETIRED} no longer sent on identity.signing-key`,
    'channel identity.user removed',
  ]);
});

test('inline messages count like referenced ones', () => {
  const before = { channels: { k: { address: 'identity.signing-key', messages: { a: message(ACTIVATED) } } } };
  assert.deepEqual(eventBreaking(before, document({ 'identity.signing-key': [ACTIVATED] })), []);
});

test('released revisions must stay byte for byte', () => {
  const before = new Map([['a/1.avsc', 'one'], ['a/2.avsc', 'two'], ['b/1.avsc', 'b']]);
  const after = new Map([['a/1.avsc', 'one'], ['a/2.avsc', 'two!'], ['a/3.avsc', 'three']]);
  assert.deepEqual(changedRevisions(before, after), ['a/2.avsc changed', 'b/1.avsc deleted']);
});
