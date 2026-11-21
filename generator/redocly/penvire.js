// Penvire contract rules from ADR 0001 in penvire-lab-backend/docs/adr.
// Path items must be inline in the service document; operations are read from `paths`.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const AUDIENCES = ['api', 'service', 'protocol'];
const PATH_PREFIX = {
  api: { pattern: /^\/v[1-9]\d*(\/|$)/, hint: '/v<major>/…' },
  service: { pattern: /^\/internal\/v[1-9]\d*(\/|$)/, hint: '/internal/v<major>/…' },
};
const VERSIONED_OR_INTERNAL = /^\/(internal(\/|$)|v\d+(\/|$))/;

function eachOperation(paths, visit) {
  for (const [route, item] of Object.entries(paths ?? {})) {
    for (const method of METHODS) {
      if (item?.[method]) visit(route, method, item[method]);
    }
  }
}

function operationAudience() {
  return {
    Paths(paths, { report, location }) {
      for (const [route, item] of Object.entries(paths)) {
        if (item && 'x-penvire-audience' in item) {
          report({
            message: 'Declare x-penvire-audience on each operation, not on the path.',
            location: location.child([route, 'x-penvire-audience']).key(),
          });
        }
      }
      eachOperation(paths, (route, method, operation) => {
        if (!AUDIENCES.includes(operation['x-penvire-audience'])) {
          report({
            message: `Operation must declare x-penvire-audience: ${AUDIENCES.join(', ')}.`,
            location: location.child([route, method]).key(),
          });
        }
      });
    },
  };
}

/** Reads the names under `key` in a catalogue file and rejects malformed ones. */
function loadCatalogue(file, key, namePattern, nameHint) {
  const entries = YAML.parse(fs.readFileSync(path.resolve(file), 'utf8'))?.[key] ?? {};
  const invalid = Object.keys(entries).filter((name) => !namePattern.test(name));
  if (invalid.length) {
    throw new Error(`${file}: ${key} names must look like ${nameHint}, got ${invalid.join(', ')}`);
  }
  return new Set(Object.keys(entries));
}

/** Checks one operation's list against the audience rules and the catalogue. */
function checkList(spec, { known, catalogue }, operation, at, report) {
  const { extension, key, required, forbidden, forbiddenReason } = spec;
  const audience = operation['x-penvire-audience'];
  const names = operation[extension];
  if (names === undefined) {
    if (required.includes(audience)) {
      report({ message: `${audience} operations must declare ${extension}.`, location: at.key() });
    }
    return;
  }
  if (forbidden.includes(audience)) {
    report({
      message: `${audience} operations must not declare ${extension}; ${forbiddenReason}`,
      location: at.child(extension).key(),
    });
    return;
  }
  if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length) {
    report({ message: `${extension} must be a non-empty list of unique names.`, location: at.child(extension) });
    return;
  }
  names
    .map((name, index) => [name, index])
    .filter(([name]) => !known.has(name))
    .forEach(([name, index]) => report({
      message: `Unknown ${key} entry ${name}; add it to ${catalogue}.`,
      location: at.child([extension, index]),
    }));
}

/**
 * Builds a rule for an operation-level list of catalogue names.
 * `required` audiences must declare a non-empty list; `forbidden` audiences must not declare one.
 */
function catalogueListRule(spec) {
  return ({ catalogue }) => {
    const known = loadCatalogue(catalogue, spec.key, spec.namePattern, spec.nameHint);
    return {
      Paths(paths, { report, location }) {
        eachOperation(paths, (route, method, operation) =>
          checkList(spec, { known, catalogue }, operation, location.child([route, method]), report));
      },
    };
  };
}

const operationScopes = catalogueListRule({
  extension: 'x-penvire-scopes',
  key: 'scopes',
  namePattern: /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/,
  nameHint: 'service:capability',
  required: ['api'],
  forbidden: ['protocol'],
  forbiddenReason: 'the protocol defines its own authorization.',
});

const operationCallers = catalogueListRule({
  extension: 'x-penvire-callers',
  key: 'workloads',
  namePattern: /^[a-z][a-z0-9-]*$/,
  nameHint: 'a lowercase workload name',
  required: ['service'],
  forbidden: ['api', 'protocol'],
  forbiddenReason: 'only service operations restrict their callers (api operations are reached through the BFF and the gateway).',
});

function pathVersion() {
  return {
    Paths(paths, { report, location }) {
      eachOperation(paths, (route, method, operation) => {
        const audience = operation['x-penvire-audience'];
        const at = location.child([route, method]).key();
        const expected = PATH_PREFIX[audience];
        if (expected && !expected.pattern.test(route)) {
          report({ message: `${audience} operations must live under ${expected.hint}.`, location: at });
        }
        if (audience === 'protocol' && VERSIONED_OR_INTERNAL.test(route)) {
          report({ message: 'protocol operations use unversioned, public paths.', location: at });
        }
      });
    },
  };
}

export default function penvirePlugin() {
  return {
    id: 'penvire',
    rules: {
      oas3: {
        'operation-audience': operationAudience,
        'operation-scopes': operationScopes,
        'operation-callers': operationCallers,
        'path-version': pathVersion,
      },
    },
  };
}
