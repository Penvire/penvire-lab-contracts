import { checkPlatform, platformObject } from './fga-check.js';

const form = document.querySelector('#fga-check');
const result = form.querySelector('output');
const { grants, relation, subject } = form.elements;

function parseGrants(text) {
  return text.split('\n').flatMap((line, index) => {
    if (!line.trim()) return [];
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 2) throw new Error(`Line ${index + 1}: enter a subject and relation.`);
    const [user, relation] = parts;
    return [{ user, relation, object: platformObject }];
  });
}

try {
  const response = await fetch(new URL('../fga/playground.json', import.meta.url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { platform, tuples } = await response.json();
  for (const name of Object.keys(platform.relations)) {
    const selected = name === 'account_read';
    relation.add(new Option(name, name, selected, selected));
  }
  grants.defaultValue = tuples.map(tuple => `${tuple.user} ${tuple.relation}`).join('\n');
  form.querySelector('fieldset').disabled = false;
  result.defaultValue = 'Ready to check.';
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const user = subject.value.trim();
      const allowed = checkPlatform(platform, parseGrants(grants.value), user, relation.value);
      result.value = `${allowed ? 'Allow' : 'Deny'} — ${user} · ${relation.value}`;
    } catch (error) {
      result.value = error.message;
    }
  });
  form.addEventListener('input', () => { result.value = result.defaultValue; });
} catch (error) {
  result.textContent = `Could not load sample grants: ${error.message}`;
}
