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
  const result = { channels: {}, operations: {}, components: { messages } };
  for (const [address, types] of Object.entries(channels)) {
    result.channels[address] = { address, messages: {} };
    result.operations[address] = { action: 'send', channel: { $ref: `#/channels/${address}` } };
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
  const before = document({ 'identity.signing-key': [ACTIVATED] });
  const after = structuredClone(before);
  after.channels['identity.signing-key'].messages[ACTIVATED] = message(ACTIVATED);
  assert.deepEqual(eventBreaking(before, after), []);
});

test('deleting a send operation or switching it to receive is breaking', () => {
  const address = 'identity.signing-key';
  const before = document({ [address]: [ACTIVATED] });
  const withoutOperation = structuredClone(before);
  delete withoutOperation.operations;
  const receiveOnly = structuredClone(before);
  receiveOnly.operations[address].action = 'receive';

  const expected = [`${ACTIVATED} no longer sent on ${address}`];
  assert.deepEqual(eventBreaking(before, withoutOperation), expected);
  assert.deepEqual(eventBreaking(before, receiveOnly), expected);
});

test('explicit send message references narrow the set of published types', () => {
  const address = 'identity.signing-key';
  const before = document({ [address]: [ACTIVATED, RETIRED] });
  const after = structuredClone(before);
  after.operations[address].messages = [{ $ref: `#/channels/${address}/messages/${ACTIVATED}` }];
  assert.deepEqual(eventBreaking(before, after), [`${RETIRED} no longer sent on ${address}`]);

  after.operations[address].messages = [];
  assert.deepEqual(eventBreaking(before, after), [
    `${ACTIVATED} no longer sent on ${address}`,
    `${RETIRED} no longer sent on ${address}`,
  ]);
});

test('released revisions must stay byte for byte', () => {
  const before = new Map([['a/1.avsc', 'one'], ['a/2.avsc', 'two'], ['b/1.avsc', 'b']]);
  const after = new Map([['a/1.avsc', 'one'], ['a/2.avsc', 'two!'], ['a/3.avsc', 'three']]);
  assert.deepEqual(changedRevisions(before, after), ['a/2.avsc changed', 'b/1.avsc deleted']);
});
