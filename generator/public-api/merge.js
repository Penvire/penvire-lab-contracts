// Merges the `api` operations of every service into the public API document (ADR 0001).
// Inputs are bundled service documents: external refs inlined, internal refs kept.

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const pascal = (name) => name.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');

function prefixRef(ref, prefix) {
  if (typeof ref !== 'string' || !ref.startsWith('#/components/')) return ref;
  const [, , type, name, ...rest] = ref.split('/');
  return ['#', 'components', type, `${prefix}${name}`, ...rest].join('/');
}

/** Prefixes every `#/components/<type>/<name>` reference so services cannot collide. */
export function prefixRefs(value, prefix) {
  if (Array.isArray(value)) return value.map((item) => prefixRefs(item, prefix));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === '$ref') return [key, prefixRef(child, prefix)];
    // Discriminator mappings hold refs as plain values.
    if (key === 'mapping' && child && typeof child === 'object' && !Array.isArray(child)) {
      return [key, Object.fromEntries(Object.entries(child).map(([name, ref]) => [name, prefixRef(ref, prefix)]))];
    }
    return [key, prefixRefs(child, prefix)];
  }));
}

function securitySchemes(openIdConnectUrl) {
  return {
    openIdConnect: {
      type: 'openIdConnect',
      openIdConnectUrl,
      description: 'OAuth access token from Identity, bound to the client key with DPoP (RFC 9449).',
    },
    apiToken: {
      type: 'http',
      scheme: 'bearer',
      description: 'API token, exchanged by the gateway for a short-lived access token.',
    },
  };
}

function publicOperation(operation) {
  const { servers: _servers, security: _security, ...rest } = operation;
  const scopes = operation['x-penvire-scopes'] ?? [];
  return { ...rest, security: [{ openIdConnect: scopes }, { apiToken: scopes }] };
}

function addOperations(merged, service, document, owners, operationIds) {
  for (const [route, item] of Object.entries(document.paths ?? {})) {
    const methods = METHODS.filter((method) => item?.[method]?.['x-penvire-audience'] === 'api');
    if (methods.length === 0) continue;
    if (owners.has(route) && owners.get(route) !== service) {
      throw new Error(`${route} is declared by both ${owners.get(route)} and ${service}`);
    }
    owners.set(route, service);
    merged.paths[route] ??= item.parameters ? { parameters: item.parameters } : {};
    for (const method of methods) {
      const { operationId } = item[method];
      if (operationIds.has(operationId)) {
        throw new Error(`operationId ${operationId} is used by both ${operationIds.get(operationId)} and ${service}`);
      }
      operationIds.set(operationId, service);
      merged.paths[route][method] = publicOperation(item[method]);
    }
  }
}

function addComponents(merged, prefix, components) {
  for (const [type, entries] of Object.entries(components ?? {})) {
    if (type === 'securitySchemes') continue;
    merged.components[type] ??= {};
    for (const [name, value] of Object.entries(entries)) merged.components[type][`${prefix}${name}`] = value;
  }
}

/**
 * Builds the public API from `[{ name, document }]`. `info.version` stays a placeholder:
 * the release step sets it from the diff against the last published document.
 */
export function mergePublicApi(services, { title, description, serverUrl, openIdConnectUrl }) {
  const merged = {
    openapi: '3.1.0',
    info: { title, version: '0.0.0', description },
    servers: [{ url: serverUrl }],
    paths: {},
    components: { securitySchemes: securitySchemes(openIdConnectUrl) },
  };
  const owners = new Map();
  const operationIds = new Map();
  for (const { name, document } of [...services].sort((a, b) => a.name.localeCompare(b.name))) {
    const prefix = pascal(name);
    const renamed = prefixRefs(document, prefix);
    addOperations(merged, name, renamed, owners, operationIds);
    addComponents(merged, prefix, renamed.components);
  }
  return merged;
}
