import { SUPPORT_ACTIONS, SUPPORT_RESOURCES, type SupportAction, type SupportResource } from './privacy-handlers';

export const SECURITY_EVENT_TYPES = Object.freeze([
  'admin.role_assigned',
  'admin.role_revoked',
  'support_access.requested',
  'support_access.granted',
  'support_access.revoked',
  'security.incident_opened',
  'privacy.export_ready',
  'privacy.export_expired',
  'privacy.deletion_requested',
  'privacy.deletion_completed',
] as const);
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

const fields: Record<SecurityEventType, readonly string[]> = {
  'admin.role_assigned': ['adminId', 'roleId', 'assignmentId', 'occurredAt', 'requestId'],
  'admin.role_revoked': ['adminId', 'roleId', 'assignmentId', 'occurredAt', 'requestId'],
  'support_access.requested': ['requestId', 'adminId', 'userId', 'scopeKeys', 'occurredAt'],
  'support_access.granted': ['requestId', 'grantId', 'adminId', 'userId', 'scopeKeys', 'occurredAt'],
  'support_access.revoked': ['requestId', 'grantId', 'adminId', 'userId', 'scopeKeys', 'occurredAt'],
  'security.incident_opened': ['incidentId', 'severity', 'occurredAt', 'requestId'],
  'privacy.export_ready': ['requestId', 'userId', 'expiresAt', 'occurredAt'],
  'privacy.export_expired': ['requestId', 'userId', 'expiresAt', 'occurredAt'],
  'privacy.deletion_requested': ['requestId', 'userId', 'occurredAt'],
  'privacy.deletion_completed': ['requestId', 'userId', 'occurredAt'],
};
const id = /^[A-Za-z0-9._:-]{1,128}$/;
const severities = new Set(['info', 'low', 'medium', 'high', 'critical']);

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function scopeKeys(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 18 || value.some((entry) => typeof entry !== 'string')) return undefined;
  const normalized = [...new Set(value as string[])].sort();
  for (const entry of normalized) {
    const [resource, action, extra] = entry.split(':');
    if (extra !== undefined || !SUPPORT_RESOURCES.includes(resource as SupportResource) || !SUPPORT_ACTIONS.includes(action as SupportAction)) return undefined;
  }
  return normalized;
}

export function buildSecurityEventPayload(type: SecurityEventType, input: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const expected = fields[type];
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify([...expected].sort())) throw new Error('SECURITY_EVENT_PAYLOAD_INVALID');
  const payload: Record<string, unknown> = { schemaVersion: 1, ...input };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'scopeKeys') {
      const normalized = scopeKeys(value);
      if (!normalized) throw new Error('SECURITY_EVENT_PAYLOAD_INVALID');
      payload.scopeKeys = normalized;
    } else if (key === 'occurredAt' || key === 'expiresAt') {
      if (!validTimestamp(value)) throw new Error('SECURITY_EVENT_PAYLOAD_INVALID');
    } else if (key === 'severity') {
      if (typeof value !== 'string' || !severities.has(value)) throw new Error('SECURITY_EVENT_PAYLOAD_INVALID');
    } else if (typeof value !== 'string' || !id.test(value)) {
      throw new Error('SECURITY_EVENT_PAYLOAD_INVALID');
    }
  }
  return payload;
}
