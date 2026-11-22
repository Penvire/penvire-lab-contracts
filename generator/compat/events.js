// Breaking changes in AsyncAPI documents, and released schema revisions that changed
// (ADR 0004 in penvire-lab-backend).

function resolve(document, value) {
  const seen = new Set();
  while (typeof value?.$ref === 'string' && value.$ref.startsWith('#/')) {
    const ref = value.$ref;
    if (seen.has(ref)) return undefined;
    seen.add(ref);
    value = ref.slice(2).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document);
  }
  return value;
}

/** Map of channel address → set of CloudEvents types sent on it. */
function sentTypes(document) {
  const result = new Map();
  for (const entry of Object.values(document?.channels ?? {})) {
    const channel = resolve(document, entry);
    if (channel?.address) result.set(channel.address, new Set());
  }
  for (const entry of Object.values(document?.operations ?? {})) {
    const operation = resolve(document, entry);
    if (operation?.action !== 'send') continue;
    const channel = resolve(document, operation.channel);
    const types = result.get(channel?.address);
    if (!types) continue;
    for (const message of operation.messages ?? Object.values(channel.messages ?? {})) {
      const type = resolve(document, message)?.headers?.properties?.ce_type?.const;
      if (type) types.add(type);
    }
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
