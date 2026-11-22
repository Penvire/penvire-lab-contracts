import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const text = (value) => String(value).replace(/[&<>]/g, (char) => entities[char]);

export function buildEventReference(source, destination, header) {
  const spec = fs.readFileSync(path.join(source, 'asyncapi.yaml'), 'utf8');
  const { info, channels } = YAML.parse(spec);
  const topics = Object.entries(channels ?? {}).map(([id, channel]) =>
    `<li><code>${text(channel.address ?? id)}</code>${channel.description ? ` — ${text(channel.description)}` : ''}</li>`);
  const avro = path.join(source, 'avro');
  const schemas = fs.readdirSync(avro, { recursive: true }).filter((file) => file.endsWith('.avsc')).sort();
  const links = schemas.map((file) => {
    const url = file.split(path.sep).map(encodeURIComponent).join('/');
    return `<li><a href="./avro/${url}" download>${text(file)}</a></li>`;
  });

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
    <p>${text(info.description ?? '')}</p>
  </section>
  <h2>Channels</h2>
  <ul>${topics.join('\n')}</ul>
  <h2>Avro schema revisions</h2>
  <ul>${links.join('\n')}</ul>
  <h2>AsyncAPI document</h2>
  <pre><code>${text(spec)}</code></pre>
</main>
</html>
`);
}
