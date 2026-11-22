import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatorHash, staleServices } from '../generator-hash.js';

const files = [
  { path: 'generator/avro/build.gradle.kts', content: 'plugins { java }' },
  { path: 'generator/avro/src/main/java/A.java', content: 'class A {}' },
];

test('the hash ignores listing order but not paths or contents', () => {
  const hash = generatorHash(files);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(generatorHash([...files].reverse()), hash);
  assert.notEqual(generatorHash([files[0], { ...files[1], content: 'class A { }' }]), hash);
  assert.notEqual(generatorHash([files[0], { ...files[1], path: 'generator/avro/src/main/java/B.java' }]), hash);
});

test('a missing or different recorded hash marks the service stale', () => {
  const hash = generatorHash(files);
  assert.deepEqual(staleServices({ identity: `${hash}\n`, tenant: 'old', audit: undefined }, hash), ['tenant', 'audit']);
});
