// Versions the public API from its diff against the last published document (ADR 0001).

const ADDITIONS = new Set(['property_added', 'object_added']);

/** Summarises an `openapi-changes report` plus the Penvire breaking findings. */
export function classify(report, penvireFindings = []) {
  const changes = report?.changes ?? [];
  return {
    changed: changes.length > 0 || penvireFindings.length > 0,
    breaking: penvireFindings.length > 0 || changes.some((change) => change.breaking),
    added: changes.some((change) => ADDITIONS.has(change.changeText)),
  };
}

/**
 * The next version, or null when nothing should be released.
 * Below 1.0.0 a breaking change bumps the minor and an addition the patch;
 * from 1.0.0 on they bump the major and the minor. Anything else bumps the patch.
 */
export function nextVersion(previous, { changed, breaking, added }) {
  if (!changed) return null;
  if (!previous) return '0.1.0';
  const [major, minor, patch] = previous.split('.').map(Number);
  if (breaking) return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  if (added) return major === 0 ? `0.${minor}.${patch + 1}` : `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
