// Static reference page for one AsyncAPI release: channels, their messages with CloudEvents
// headers, record key and Avro payload fields, and every schema revision readable inline.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const text = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => entities[char]);
/** Backticked spans in descriptions become `<code>`, as they read in the YAML. */
const prose = (value) => text(value).replace(/`([^`]+)`/g, '<code>$1</code>');
const anchor = (...parts) => parts.join('-').replace(/[^A-Za-z0-9_-]+/g, '-');

const PRIMITIVES = new Set(['null', 'boolean', 'int', 'long', 'float', 'double', 'bytes', 'string']);

/**
 * Describes an Avro schema for display. Returns `{ type, optional, named }`: `type` is HTML for the
 * type column, `optional` is true for a union with null, and `named` lists the records, enums and
 * fixed types defined inside it, in order of definition, so each can get its own table.
 */
export function describeAvro(schema, namespace = '', named = []) {
  const fullName = (name, ns) => (name.includes('.') ? name : ns ? `${ns}.${name}` : name);
  const shortName = (name) => name.slice(name.lastIndexOf('.') + 1);
  const ref = (name) => `<a href="#${anchor('type', name)}"><code>${text(shortName(name))}</code></a>`;

  function walk(node, ns) {
    if (typeof node === 'string') {
      return PRIMITIVES.has(node) ? `<code>${node}</code>` : ref(fullName(node, ns));
    }
    if (Array.isArray(node)) return node.map((branch) => walk(branch, ns)).join(' | ');
    switch (node.type) {
      case 'record':
      case 'error':
      case 'enum':
      case 'fixed': {
        const name = fullName(node.name, node.namespace ?? ns);
        const inner = name.slice(0, name.lastIndexOf('.'));
        const entry = { name, kind: node.type === 'error' ? 'record' : node.type, doc: node.doc };
        named.push(entry);
        if (entry.kind === 'record') {
          entry.fields = node.fields.map((field) => {
            const optional = Array.isArray(field.type) && field.type.includes('null');
            return { name: field.name, doc: field.doc, default: field.default, optional, type: walk(field.type, inner) };
          });
        } else if (entry.kind === 'enum') {
          entry.symbols = node.symbols;
        } else {
          entry.size = node.size;
        }
        return ref(name);
      }
      case 'array':
        return `array&lt;${walk(node.items, ns)}&gt;`;
      case 'map':
        return `map&lt;${walk(node.values, ns)}&gt;`;
      default: {
        const base = walk(node.type, ns);
        if (!node.logicalType) return base;
        const scale = node.logicalType === 'decimal' ? `(${node.precision}, ${node.scale ?? 0})` : '';
        return `${base} <span class="muted">${text(node.logicalType)}${scale}</span>`;
      }
    }
  }

  const type = walk(schema, namespace);
  return { type, optional: Array.isArray(schema) && schema.includes('null'), named };
}

function namedTable(entry) {
  const id = anchor('type', entry.name);
  const head = `<h5 id="${id}"><code>${text(entry.name.slice(entry.name.lastIndexOf('.') + 1))}</code> <span class="muted">${entry.kind}</span></h5>
${entry.doc ? `<p>${prose(entry.doc)}</p>` : ''}`;
  if (entry.kind === 'enum') {
    return `${head}<p class="symbols">${entry.symbols.map((symbol) => `<code>${text(symbol)}</code>`).join(' ')}</p>`;
  }
  if (entry.kind === 'fixed') return `${head}<p>${entry.size} bytes</p>`;
  const rows = entry.fields.map((field) => `<tr>
  <td><code>${text(field.name)}</code>${field.optional ? '' : ' <span class="required">required</span>'}</td>
  <td>${field.type}</td>
  <td>${prose(field.doc)}${field.default !== undefined ? ` <span class="muted">Default: <code>${text(JSON.stringify(field.default))}</code></span>` : ''}</td>
</tr>`);
  return `${head}<table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function headerRows(headers) {
  const required = new Set(headers?.required ?? []);
  return Object.entries(headers?.properties ?? {}).map(([name, header]) => {
    const value = header.const !== undefined
      ? `<code>${text(header.const)}</code>`
      : `<code>${text(header.type ?? 'any')}</code>${header.format ? ` <span class="muted">${text(header.format)}</span>` : ''}`
        + (header.pattern ? `<div class="pattern"><code>${text(header.pattern)}</code></div>` : '');
    return `<tr>
  <td><code>${text(name)}</code>${required.has(name) ? ' <span class="required">required</span>' : ''}</td>
  <td>${value}</td>
  <td>${prose(header.description)}</td>
</tr>`;
  }).join('');
}

function messageSection(source, channelId, key, message) {
  const schemaRef = message.payload?.schema?.$ref ?? '';
  const ref = /^\.\/avro\/([^/]+)\/([1-9][0-9]*)\.avsc$/.exec(schemaRef);
  let payload = '<p class="muted">The payload is not an Avro schema revision.</p>';
  if (ref) {
    const schema = JSON.parse(fs.readFileSync(path.join(source, schemaRef), 'utf8'));
    const { named } = describeAvro(schema);
    payload = `<p>Avro record <a href="#${anchor('schema', ref[1])}"><code>${text(ref[1])}</code></a>, revision ${ref[2]}.</p>
${named.map(namedTable).join('\n')}`;
  }
  const kafkaKey = message.bindings?.kafka?.key;
  return `<article class="message" id="${anchor('message', channelId, key)}">
  <h4>${text(message.title ?? message.name ?? key)}${message.headers?.properties?.ce_type?.const ? ` <code class="muted">${text(message.headers.properties.ce_type.const)}</code>` : ''}</h4>
  ${message.summary ? `<p class="summary">${prose(message.summary)}</p>` : ''}
  ${message.description ? `<p>${prose(message.description)}</p>` : ''}
  ${kafkaKey ? `<p><strong>Record key</strong> <code>${text(kafkaKey.type ?? 'string')}</code>: ${prose(kafkaKey.description)}</p>` : ''}
  <h5>Headers</h5>
  <table><thead><tr><th>Header</th><th>Value</th><th>Description</th></tr></thead><tbody>${headerRows(message.headers)}</tbody></table>
  <h5>Payload</h5>
  ${payload}
</article>`;
}

function resolve(document, value) {
  const ref = value?.$ref;
  if (!ref?.startsWith('#/')) return value;
  return ref.slice(2).split('/').reduce((node, part) => node?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], document);
}

function revisionsSection(avro) {
  const byName = Map.groupBy(
    fs.readdirSync(avro, { recursive: true }).filter((file) => file.endsWith('.avsc')),
    (file) => path.dirname(file));
  return [...byName.keys()].sort().map((fullName) => {
    const revisions = byName.get(fullName)
      .map((file) => Number(path.basename(file, '.avsc')))
      .sort((a, b) => b - a);
    const items = revisions.map((revision, index) => {
      const file = path.join(fullName, `${revision}.avsc`);
      const url = file.split(path.sep).map(encodeURIComponent).join('/');
      const content = fs.readFileSync(path.join(avro, file), 'utf8');
      return `<details${index === 0 ? ' open' : ''}>
  <summary>Revision ${revision}${index === 0 ? ' <span class="badge">latest</span>' : ''} <a href="./avro/${url}" download>download</a></summary>
  <pre><code>${text(content)}</code></pre>
</details>`;
    });
    return `<section class="schema" id="${anchor('schema', fullName)}">
  <h3><code>${text(fullName)}</code></h3>
  ${items.join('\n')}
</section>`;
  }).join('\n');
}

export function buildEventReference(source, destination, header) {
  const spec = fs.readFileSync(path.join(source, 'asyncapi.yaml'), 'utf8');
  const document = YAML.parse(spec);
  const { info } = document;
  const channels = Object.entries(document.channels ?? {});
  const operations = Object.values(document.operations ?? {});

  const nav = channels.map(([id, channel]) => `<li><a href="#${anchor('channel', id)}"><code>${text(channel.address ?? id)}</code></a></li>`);
  const sections = channels.map(([id, channel]) => {
    const actions = [...new Set(operations
      .filter((operation) => operation.channel?.$ref === `#/channels/${id}`)
      .map((operation) => operation.action))];
    const messages = Object.entries(channel.messages ?? {})
      .map(([key, message]) => messageSection(source, id, key, resolve(document, message)));
    return `<section class="channel" id="${anchor('channel', id)}">
  <h3><code>${text(channel.address ?? id)}</code>${actions.map((action) => ` <span class="badge">${text(action)}</span>`).join('')}</h3>
  ${channel.description ? `<p>${prose(channel.description)}</p>` : ''}
  ${messages.join('\n')}
</section>`;
  });

  const avro = path.join(source, 'avro');
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(source, 'asyncapi.yaml'), path.join(destination, 'asyncapi.yaml'));
  fs.cpSync(avro, path.join(destination, 'avro'), { recursive: true });
  fs.writeFileSync(path.join(destination, 'index.html'), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text(info.title)} · AsyncAPI reference</title>
<script src="../assets/theme.js"></script>
<link rel="stylesheet" href="../assets/site.css">
${header}
<main class="container event-reference">
  <section class="hero">
    <h1>${text(info.title)}</h1>
    <p>${prose(info.description)}</p>
  </section>
  <nav class="toc" aria-label="Channels"><span class="muted">Channels</span><ul>${nav.join('')}</ul></nav>
  <h2>Channels</h2>
  ${sections.join('\n')}
  <h2>Avro schema revisions</h2>
  <p class="muted">Every revision is shipped in the events package as <code>avro/&lt;full name&gt;/&lt;revision&gt;.avsc</code>; a consumer finds the writer schema from <code>ce_dataschema</code>.</p>
  ${revisionsSection(avro)}
  <h2>AsyncAPI document</h2>
  <details><summary>Show <code>asyncapi.yaml</code></summary><pre><code>${text(spec)}</code></pre></details>
</main>
</html>
`);
}
