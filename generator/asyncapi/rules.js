// Penvire rules for AsyncAPI documents (ADR 0004 in penvire-lab-backend): CloudEvents in Kafka
// binary content mode, Avro payloads from numbered schema revisions, one topic per aggregate type;
// and for audit events (ADR 0006) one shared record shape on one `<service>.audit` topic.
import { isDeepStrictEqual } from 'node:util';

export const REQUIRED_HEADERS = [
  'ce_specversion', 'ce_id', 'ce_source', 'ce_type', 'ce_subject', 'ce_time', 'ce_dataschema', 'content-type',
];

const PAYLOAD_REF = /^\.\/avro\/([^/]+)\/([1-9][0-9]*)\.avsc$/;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `AccessTokenIssued` → `access-token-issued`, `UserMFAEnabled` → `user-mfa-enabled`. */
export const kebab = (name) =>
  name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** The `ce_dataschema` pattern for every revision of a schema. */
export const dataschemaPattern = (fullName) => `^urn:penvire-lab:schema:${escape(fullName)}:[1-9][0-9]*$`;

function messageProblems(service, name, message, latestRevision) {
  const problems = [];
  const at = `message ${name}`;
  const headers = message?.headers ?? {};
  const header = (key) => headers.properties?.[key] ?? {};

  const missing = REQUIRED_HEADERS.filter((key) => !(headers.required ?? []).includes(key));
  if (missing.length > 0) problems.push(`${at}: headers must require ${missing.join(', ')}`);

  const source = `/penvire-lab/${service}`;
  if (header('ce_source').const !== source) problems.push(`${at}: ce_source must be const ${source}`);

  const type = /^dev\.penvire\.lab\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\.v([1-9][0-9]*)$/.exec(header('ce_type').const ?? '');
  if (!type || type[1] !== service) {
    problems.push(`${at}: ce_type must be const dev.penvire.lab.${service}.<event>.v<major>`);
  }

  if (!String(message?.payload?.schemaFormat ?? '').startsWith('application/vnd.apache.avro')) {
    problems.push(`${at}: payload.schemaFormat must be application/vnd.apache.avro;version=…`);
  }
  if (message?.contentType !== undefined && message.contentType !== 'application/avro') {
    problems.push(`${at}: contentType must be application/avro`);
  }
  if (message?.bindings?.kafka?.key === undefined) {
    problems.push(`${at}: bindings.kafka.key must describe the record key (the aggregate ID)`);
  }

  const ref = PAYLOAD_REF.exec(message?.payload?.schema?.$ref ?? '');
  if (!ref) {
    problems.push(`${at}: payload.schema must $ref ./avro/<full name>/<revision>.avsc`);
    return problems;
  }
  const [, fullName, revision] = ref;
  const schema = /^dev\.penvire\.lab\.([a-z0-9_]+)\.events\.v([1-9][0-9]*)\.([A-Z][A-Za-z0-9]*)$/.exec(fullName);
  if (!schema || schema[1] !== service) {
    problems.push(`${at}: schema ${fullName} must be named dev.penvire.lab.${service}.events.v<major>.<RecordName>`);
  } else if (type) {
    if (schema[2] !== type[3]) problems.push(`${at}: ce_type major v${type[3]} differs from schema major v${schema[2]}`);
    if (kebab(schema[3]) !== type[2]) problems.push(`${at}: ce_type event ${type[2]} must be ${kebab(schema[3])}`);
  }
  const latest = latestRevision(fullName);
  if (latest === undefined) {
    problems.push(`${at}: schema ${fullName} has no revisions`);
  } else if (Number(revision) !== latest) {
    problems.push(`${at}: must reference the latest revision ${latest} of ${fullName}, not ${revision}`);
  }
  if (header('ce_dataschema').pattern !== dataschemaPattern(fullName)) {
    problems.push(`${at}: ce_dataschema must have pattern '${dataschemaPattern(fullName)}'`);
  }
  return problems;
}

export const AUDIT_MESSAGE = 'AuditRecorded';

/** The full name of a service's audit record (ADR 0006). */
export const auditFullName = (service) => `dev.penvire.lab.${service}.events.v1.${AUDIT_MESSAGE}`;

/**
 * Every service records audit events (ADR 0006), so every service with an OpenAPI document needs
 * an AsyncAPI document too. Returns one problem per service that lacks it.
 */
export function missingAuditProducers(apiServices, eventServices) {
  return apiServices.filter((service) => !eventServices.includes(service)).map((service) =>
    `asyncapi/${service}/asyncapi.yaml is missing: every service records audit events (ADR 0006), `
    + 'so it needs an AsyncAPI document with an audit channel; copy Identity\'s');
}

/**
 * Problems with a service's audit events (ADR 0006), as readable lines: every service sends
 * `AuditRecorded`, alone, on `<service>.audit`, and the latest revision of its record is the shared
 * definition (`shared`, without a namespace) in the service's namespace. `latestSchema` is that
 * revision's parsed JSON, or undefined when there is none.
 */
export function auditRules(service, document, shared, latestSchema) {
  const problems = [];
  const address = `${service}.audit`;
  const ref = `#/components/messages/${AUDIT_MESSAGE}`;
  const channels = Object.entries(document?.channels ?? {});
  const audit = channels.filter(([, channel]) => channel?.address === address);
  if (audit.length !== 1) {
    problems.push(`channels: exactly one channel must have address ${address}, found ${audit.length}`);
  }
  for (const [id, channel] of channels) {
    const refs = Object.values(channel?.messages ?? {}).map((message) => message?.$ref);
    if (channel?.address === address && (refs.length !== 1 || refs[0] !== ref)) {
      problems.push(`channel ${id}: ${address} must carry ${AUDIT_MESSAGE} and nothing else`);
    } else if (channel?.address !== address && refs.includes(ref)) {
      problems.push(`channel ${id}: ${AUDIT_MESSAGE} may only be sent on ${address}`);
    }
  }
  if (document?.components?.messages?.[AUDIT_MESSAGE] === undefined) {
    problems.push(`components.messages: must define ${AUDIT_MESSAGE}`);
  }

  const fullName = auditFullName(service);
  if (latestSchema === undefined) {
    problems.push(`schema ${fullName} has no revisions`);
    return problems;
  }
  const { namespace, ...rest } = latestSchema;
  if (namespace !== fullName.slice(0, fullName.lastIndexOf('.')) || !isDeepStrictEqual(rest, shared)) {
    problems.push(`schema ${fullName}: the latest revision differs from asyncapi/audit-recorded.avsc; `
      + 'add a revision that copies it, with only the namespace added');
  }
  return problems;
}

/**
 * Problems with one service's AsyncAPI document, as readable lines.
 * `latestRevision(fullName)` returns the highest revision on disk, or undefined.
 */
export function eventRules(service, document, latestRevision) {
  const problems = [];
  const address = new RegExp(`^${escape(service)}\\.[a-z][a-z0-9-]*$`);
  for (const [id, channel] of Object.entries(document?.channels ?? {})) {
    if (!address.test(channel?.address ?? '')) {
      problems.push(`channel ${id}: address must be ${service}.<aggregate>, e.g. ${service}.access-token`);
    }
    for (const [key, message] of Object.entries(channel?.messages ?? {})) {
      if (!String(message?.$ref ?? '').startsWith('#/components/messages/')) {
        problems.push(`channel ${id}: message ${key} must $ref #/components/messages/…`);
      }
    }
  }
  for (const [name, message] of Object.entries(document?.components?.messages ?? {})) {
    problems.push(...messageProblems(service, name, message, latestRevision));
  }
  return problems;
}
