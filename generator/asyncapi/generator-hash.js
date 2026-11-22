// Every <service>-events package records a hash of the code generator in
// asyncapi/<service>/generator.sha256. release-please only releases a component when a commit
// touches its path, so a generator change must update those files to release the packages it
// changes.
import crypto from 'node:crypto';

/** The generator's own sources: they decide what the generated classes look like. */
export const GENERATOR_SOURCES = ['generator/avro/build.gradle.kts', 'generator/avro/src/main'];

/** SHA-256 over `[{ path, content }]`, independent of the order they are listed in. */
export function generatorHash(files) {
  const hash = crypto.createHash('sha256');
  for (const { path, content } of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(`${path}\0${content}\0`);
  }
  return hash.digest('hex');
}

/** Services whose recorded hash is missing or differs from `current`. */
export function staleServices(recorded, current) {
  return Object.entries(recorded)
    .filter(([, hash]) => hash?.trim() !== current)
    .map(([service]) => service);
}
