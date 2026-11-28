export const platformObject = 'platform:global';

function validateGrant(platform, { user, relation, object }) {
  const type = /^(user|client):[^\s:#*]+$/.exec(user)?.[1];
  const allowedTypes = platform.metadata.relations[relation]?.directly_related_user_types ?? [];
  if (object !== platformObject || !allowedTypes.some(entry => Object.keys(entry).length === 1 && entry.type === type)) {
    throw new Error(`Invalid direct grant: ${user} ${relation} ${object}`);
  }
}

// This browser evaluator covers direct grants, computed relations and unions only.
export function checkPlatform(platform, tuples, user, relation, object = platformObject) {
  if (object !== platformObject) throw new Error(`Unsupported object: ${object}`);
  if (!/^(user|client):[^\s:#*]+$/.test(user)) throw new Error('Enter a subject such as user:alice or client:alice.');
  for (const tuple of tuples) validateGrant(platform, tuple);

  const visit = (name, seen) => {
    if (!Object.hasOwn(platform.relations, name) || seen.has(name)) throw new Error(`Unsupported relation: ${name}`);
    const path = new Set([...seen, name]);
    const evaluate = (rule) => {
      if (rule.this) return tuples.some(tuple => tuple.user === user && tuple.relation === name);
      if (rule.computedUserset) return visit(rule.computedUserset.relation, path);
      if (rule.union) return rule.union.child.map(evaluate).some(Boolean);
      throw new Error(`Unsupported rule for ${name}`);
    };
    return evaluate(platform.relations[name]);
  };
  return visit(relation, new Set());
}
