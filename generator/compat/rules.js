// What counts as breaking beyond openapi-changes' structural diff (ADR 0001).
// Documents must be bundled and dereferenced, so parameters are inline objects.

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** True when a Conventional Commit title marks a breaking change, e.g. `feat(identity)!: …`. */
export function isBreakingTitle(title) {
  return /^[a-z]+(\([^)]*\))?!: \S/.test(title ?? '');
}

/** Breaking changes from an `openapi-changes report` result, as readable lines. */
export function reportBreaking(report) {
  return (report?.changes ?? [])
    .filter((change) => change.breaking)
    .map((change) => `${change.changeText} at ${change.path}${change.property ? ` (${change.property})` : ''}`);
}

function operations(document) {
  const result = new Map();
  for (const [route, item] of Object.entries(document?.paths ?? {})) {
    for (const method of METHODS.filter((name) => item?.[name])) {
      result.set(`${method.toUpperCase()} ${route}`, { item, operation: item[method] });
    }
  }
  return result;
}

/** Operation parameters win over path-level ones with the same name and location. */
function requiredParameters({ item, operation }) {
  const byKey = new Map();
  for (const parameter of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
    byKey.set(`${parameter.in}:${parameter.name}`, parameter);
  }
  return new Set([...byKey].filter(([, parameter]) => parameter.required === true).map(([key]) => key));
}

const added = (before = [], after = []) => after.filter((name) => !before.includes(name));

function operationBreaking(key, before, after) {
  const findings = [];
  const oldAudience = before.operation['x-penvire-audience'];
  const newAudience = after.operation['x-penvire-audience'];
  if (oldAudience !== newAudience) {
    findings.push(`${key}: audience changed from ${oldAudience} to ${newAudience}`);
  }
  for (const scope of added(before.operation['x-penvire-scopes'], after.operation['x-penvire-scopes'])) {
    findings.push(`${key}: requires new scope ${scope}`);
  }
  for (const caller of added(after.operation['x-penvire-callers'], before.operation['x-penvire-callers'])) {
    findings.push(`${key}: caller ${caller} no longer allowed`);
  }
  const wasRequired = requiredParameters(before);
  for (const parameter of requiredParameters(after)) {
    if (!wasRequired.has(parameter)) findings.push(`${key}: parameter ${parameter} became required`);
  }
  return findings;
}

/**
 * Breaking changes openapi-changes does not see: Penvire extensions and newly required parameters.
 * Removed operations are left to openapi-changes.
 */
export function penvireBreaking(oldDocument, newDocument) {
  const current = operations(newDocument);
  return [...operations(oldDocument)]
    .filter(([key]) => current.has(key))
    .flatMap(([key, before]) => operationBreaking(key, before, current.get(key)));
}
