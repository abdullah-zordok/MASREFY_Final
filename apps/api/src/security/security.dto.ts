import { HttpException } from '@nestjs/common';

export const allowedBodyFields: Readonly<Record<string, readonly string[]>> = {
  disableAdmin: ['reason', 'revokeEligibleSessions', 'replacementAdminId', 'expectedVersion'],
  revokeAdminSessions: ['sessionIds', 'revokeAllEligible', 'reason', 'expectedVersion'],
  createAdminInvitation: ['email', 'name', 'roleId', 'department', 'expiresInHours', 'message'],
  acceptAdminInvitation: ['token'],
  createRole: ['key', 'name', 'description', 'permissionKeys', 'reason'],
  updateRole: ['name', 'description', 'enabled', 'permissionKeys', 'reason', 'expectedVersion'],
  assignAdminRole: ['userId', 'roleId', 'startsAt', 'endsAt', 'reason'],
  revokeAdminRole: ['reason', 'expectedVersion'],
  createSupportAccessRequest: [
    'userId',
    'supportTicketId',
    'assignee',
    'purpose',
    'resourceScopes',
    'durationMinutes',
    'customerApprovalRequired',
  ],
  decideSupportAccessRequest: [
    'decision',
    'reason',
    'approvedScope',
    'durationMinutes',
    'startsAt',
    'expectedVersion',
  ],
  revokeSupportAccess: ['reason', 'expectedVersion'],
  endSupportAccess: ['reason', 'expectedVersion'],
  decideMySupportAccessRequest: ['decision', 'expectedVersion'],
  createSecurityIncident: ['title', 'severity', 'detectedAt', 'ownerId', 'summaryRedacted'],
  updateSecurityIncident: ['action', 'note', 'reason', 'expectedVersion'],
  createMyPrivacyExport: ['scope'],
  createMyDeletionRequest: ['confirmation', 'reason'],
  cancelMyDeletionRequest: [],
  actOnPrivacyExport: ['action', 'reason', 'expectedVersion'],
  actOnDeletionRequest: ['action', 'reason', 'expectedVersion'],
  updateRetentionPolicy: [
    'retentionDays',
    'deletionMode',
    'legalBasis',
    'enabled',
    'reason',
    'expectedVersion',
  ],
  createRetentionHold: ['resourceType', 'resourceId', 'reason', 'startsAt', 'endsAt'],
  releaseRetentionHold: ['reason', 'expectedVersion'],
};

export const allowedQueryFields: Readonly<Record<string, readonly string[]>> = {
  listAdmins: ['limit', 'cursor', 'status', 'search'],
  listAdminInvitations: ['limit', 'cursor', 'status'],
  listRoles: ['limit', 'cursor', 'search', 'enabled', 'systemRole'],
  listPermissions: ['limit', 'cursor', 'resource', 'search'],
  listMySecurityEvents: ['limit', 'cursor', 'type', 'severity'],
  listAdminSecurityEvents: ['limit', 'cursor', 'type', 'severity', 'userId'],
  getSecurityOverview: ['platform', 'period'],
  listAuditEvents: [
    'limit',
    'cursor',
    'actor',
    'action',
    'resource',
    'result',
    'severity',
    'from',
    'to',
  ],
  listSecurityIncidents: ['limit', 'cursor', 'status', 'severity', 'owner'],
  listSupportAccessRequests: ['limit', 'cursor', 'status', 'assignee', 'search'],
  listMySupportAccessRequests: ['limit', 'cursor', 'status'],
  listPrivacyExports: ['limit', 'cursor', 'status', 'from', 'to'],
  listDeletionRequests: ['limit', 'cursor', 'status', 'hold'],
  listRetentionPolicies: ['limit', 'cursor', 'resource', 'status'],
};

export function inputObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).length > 20 ||
    ['role', 'roles', 'permission', 'permissions', '__scenario', 'confirmationToken'].some(
      (key) => key in object,
    )
  ) {
    throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  }
  return object;
}

export function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

const unsafeEvidence =
  /(?:https?:\/\/|bearer\s+|(?:sk|whsec)_[A-Za-z0-9_-]+|\b(?:\d{1,3}\.){3}\d{1,3}\b|[^\s@]+@[^\s@]+)/i;

export function assertSafeTextFields(body: Record<string, unknown>): void {
  for (const key of [
    'reason',
    'purpose',
    'message',
    'title',
    'summaryRedacted',
    'note',
    'legalBasis',
  ]) {
    const value = body[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' || containsControlCharacter(value) || unsafeEvidence.test(value))
    ) {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }
}
