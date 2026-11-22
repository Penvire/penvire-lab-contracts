// Breaking changes in AsyncAPI documents, and released schema revisions that changed
// (ADR 0004 in penvire-lab-backend).

function resolve(document, value) {
  const ref = value?.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return value;
  return ref.slice(2).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document);
}

/** Map of channel address → set of CloudEvents types sent on it. */
function sentTypes(document) {
  const result = new Map();
  for (const channel of Object.values(document?.channels ?? {})) {
    const types = new Set(Object.values(channel?.messages ?? {})
      .map((message) => resolve(document, message)?.headers?.properties?.ce_type?.const)
      .filter(Boolean));
    result.set(channel.address, types);
  }
  return result;
}

/** Consumers break when a topic disappears or a topic stops carrying an event type. */
export function eventBreaking(before, after) {
  const [old, current] = [sentTypes(before), sentTypes(after)];
  const findings = [];
  for (const [address, types] of old) {
    if (!current.has(address)) {
      findings.push(`channel ${address} removed`);
      continue;
    }
    for (const type of types) {
      if (!current.get(address).has(type)) findings.push(`${type} no longer sent on ${address}`);
    }
  }
  return findings;
}

/**
 * Released schema revisions are immutable: consumers decode old events with them. Takes maps of
 * revision path → file content and lists every revision that was changed or deleted.
 */
export function changedRevisions(before, after) {
  return [...before]
    .filter(([file, content]) => after.get(file) !== content)
    .map(([file]) => `${file} ${after.has(file) ? 'changed' : 'deleted'}`);
}
