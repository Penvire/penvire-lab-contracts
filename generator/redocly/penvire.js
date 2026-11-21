// Penvire contract rules from ADR 0001 in penvire-lab-backend/docs/adr.
// Path items must be inline in the service document; operations are read from `paths`.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const AUDIENCES = ['api', 'service', 'protocol'];
const SCOPE_NAME = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
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

function loadCatalogue(file) {
  const scopes = YAML.parse(fs.readFileSync(path.resolve(file), 'utf8'))?.scopes ?? {};
  const invalid = Object.keys(scopes).filter((name) => !SCOPE_NAME.test(name));
  if (invalid.length) {
    throw new Error(`${file}: scope names must look like service:capability, got ${invalid.join(', ')}`);
  }
  return new Set(Object.keys(scopes));
}

function operationScopes({ catalogue }) {
  const known = loadCatalogue(catalogue);
  return {
    Paths(paths, { report, location }) {
      eachOperation(paths, (route, method, operation) => {
        const at = location.child([route, method]);
        const audience = operation['x-penvire-audience'];
        const scopes = operation['x-penvire-scopes'];
        if (scopes === undefined) {
          if (audience === 'api') {
            report({ message: 'api operations must declare x-penvire-scopes.', location: at.key() });
          }
          return;
        }
        if (audience === 'protocol') {
          report({
            message: 'protocol operations must not declare x-penvire-scopes; the protocol defines its own authorization.',
            location: at.child('x-penvire-scopes').key(),
          });
          return;
        }
        if (!Array.isArray(scopes) || scopes.length === 0 || new Set(scopes).size !== scopes.length) {
          report({
            message: 'x-penvire-scopes must be a non-empty list of unique scope names.',
            location: at.child('x-penvire-scopes'),
          });
          return;
        }
        scopes.forEach((scope, index) => {
          if (!known.has(scope)) {
            report({
              message: `Unknown scope ${scope}; add it to ${catalogue}.`,
              location: at.child(['x-penvire-scopes', index]),
            });
          }
        });
      });
    },
  };
}

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
        'path-version': pathVersion,
      },
    },
  };
}
