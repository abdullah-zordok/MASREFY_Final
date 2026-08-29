import { buildSecurityEventPayload, SECURITY_EVENT_TYPES } from '../../../src/security/security.events';

const at = '2026-08-29T12:00:00.000Z';
const fixtures = {
  'admin.role_assigned': { adminId: 'admin-a', roleId: 'role-a', assignmentId: 'assignment-a', occurredAt: at, requestId: 'request-a' },
  'admin.role_revoked': { adminId: 'admin-a', roleId: 'role-a', assignmentId: 'assignment-a', occurredAt: at, requestId: 'request-a' },
  'support_access.requested': { requestId: 'request-a', adminId: 'admin-a', userId: 'user-a', scopeKeys: ['profile-contact:read-masked'], occurredAt: at },
  'support_access.granted': { requestId: 'request-a', grantId: 'grant-a', adminId: 'admin-a', userId: 'user-a', scopeKeys: ['profile-contact:read-masked'], occurredAt: at },
  'support_access.revoked': { requestId: 'request-a', grantId: 'grant-a', adminId: 'admin-a', userId: 'user-a', scopeKeys: ['profile-contact:read-masked'], occurredAt: at },
  'security.incident_opened': { incidentId: 'incident-a', severity: 'high', occurredAt: at, requestId: 'request-a' },
  'privacy.export_ready': { requestId: 'request-a', userId: 'user-a', expiresAt: '2026-08-30T12:00:00.000Z', occurredAt: at },
  'privacy.export_expired': { requestId: 'request-a', userId: 'user-a', expiresAt: '2026-08-30T12:00:00.000Z', occurredAt: at },
  'privacy.deletion_requested': { requestId: 'request-a', userId: 'user-a', occurredAt: at },
  'privacy.deletion_completed': { requestId: 'request-a', userId: 'user-a', occurredAt: at },
} as const;

describe('Phase 03 security event contracts', () => {
  it('builds all ten exact schema-versioned payloads', () => {
    expect(SECURITY_EVENT_TYPES).toEqual(Object.keys(fixtures));
    for (const type of SECURITY_EVENT_TYPES) {
      expect(buildSecurityEventPayload(type, fixtures[type])).toEqual({ schemaVersion: 1, ...fixtures[type] });
    }
  });

  it.each(['reason', 'email', 'token', 'url', 'storageKey', 'unknown'])('rejects unsafe or unknown field %s', (field) => {
    expect(() => buildSecurityEventPayload('admin.role_assigned', { ...fixtures['admin.role_assigned'], [field]: 'unsafe' })).toThrow('SECURITY_EVENT_PAYLOAD_INVALID');
  });

  it('sorts unique scope keys and rejects unknown or oversized scope', () => {
    const payload = buildSecurityEventPayload('support_access.requested', {
      ...fixtures['support_access.requested'],
      scopeKeys: ['session-diagnostics:read-status', 'profile-contact:read-masked', 'profile-contact:read-masked'],
    });
    expect(payload.scopeKeys).toEqual(['profile-contact:read-masked', 'session-diagnostics:read-status']);
    expect(() => buildSecurityEventPayload('support_access.requested', { ...fixtures['support_access.requested'], scopeKeys: ['profile-contact:write'] })).toThrow('SECURITY_EVENT_PAYLOAD_INVALID');
  });

  it('rejects malformed identifiers, timestamps, severities, and alert-like URLs', () => {
    expect(() => buildSecurityEventPayload('security.incident_opened', { ...fixtures['security.incident_opened'], severity: 'urgent' })).toThrow('SECURITY_EVENT_PAYLOAD_INVALID');
    expect(() => buildSecurityEventPayload('privacy.export_ready', { ...fixtures['privacy.export_ready'], expiresAt: 'https://example.test/file' })).toThrow('SECURITY_EVENT_PAYLOAD_INVALID');
    expect(() => buildSecurityEventPayload('admin.role_assigned', { ...fixtures['admin.role_assigned'], adminId: 'contains space' })).toThrow('SECURITY_EVENT_PAYLOAD_INVALID');
  });
});
