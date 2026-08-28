const profileFields = new Set([
  'display_name',
  'locale',
  'timezone',
  'primary_email',
  'phone_e164',
]);

function assertProfileIdentity(profileId: string, profileVersion: number): void {
  if (profileId.trim() !== profileId || profileId.length < 1 || profileId.length > 128) {
    throw new Error('PROFILE_EVENT_ID_INVALID');
  }
  if (!Number.isSafeInteger(profileVersion) || profileVersion < 1) {
    throw new Error('PROFILE_EVENT_VERSION_INVALID');
  }
}

export function buildProfileCreatedPayload(
  profileId: string,
  source: 'clerk_webhook' | 'clerk_reconciliation',
  sourceEventId: string | null,
): Record<string, unknown> {
  assertProfileIdentity(profileId, 1);
  if ((source === 'clerk_webhook') !== (sourceEventId !== null)) {
    throw new Error('PROFILE_EVENT_SOURCE_INVALID');
  }
  if (sourceEventId !== null && (sourceEventId.trim() !== sourceEventId || sourceEventId.length > 128)) {
    throw new Error('PROFILE_EVENT_SOURCE_ID_INVALID');
  }
  return { payloadVersion: 1, profileId, profileVersion: 1, source, sourceEventId };
}

export function buildProfileUpdatedPayload(
  profileId: string,
  profileVersion: number,
  changedFields: readonly string[],
  source: 'customer_api' | 'clerk_webhook' | 'clerk_reconciliation' = 'customer_api',
  sourceEventId: string | null = null,
): Record<string, unknown> {
  assertProfileIdentity(profileId, profileVersion);
  const fields = [...new Set(changedFields)].sort();
  if (
    fields.length < 1 ||
    fields.length > 5 ||
    fields.some((field) => !profileFields.has(field)) ||
    (source === 'clerk_webhook') !== (sourceEventId !== null)
  ) {
    throw new Error('PROFILE_EVENT_PAYLOAD_INVALID');
  }
  return {
    payloadVersion: 1,
    profileId,
    profileVersion,
    changedFields: fields,
    source,
    sourceEventId,
  };
}

export function buildProfileDeletionRequestedPayload(
  profileId: string,
  profileVersion: number,
  source: 'clerk_webhook' | 'clerk_reconciliation',
  sourceEventId: string | null,
  observedAt: Date,
): Record<string, unknown> {
  assertProfileIdentity(profileId, profileVersion);
  if (
    (source === 'clerk_webhook') !== (sourceEventId !== null) ||
    !Number.isFinite(observedAt.getTime())
  ) {
    throw new Error('PROFILE_EVENT_PAYLOAD_INVALID');
  }
  return {
    payloadVersion: 1,
    profileId,
    profileVersion,
    source,
    sourceEventId,
    observedAt: observedAt.toISOString(),
  };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildDeviceRegisteredPayload(
  profileId: string,
  deviceId: string,
  platform: 'ios' | 'android' | 'web',
  deviceVersion: number,
  registrationResult: 'created' | 'refreshed' | 'reactivated_with_fresh_session',
): Record<string, unknown> {
  assertProfileIdentity(profileId, deviceVersion);
  if (!uuid.test(deviceId)) throw new Error('DEVICE_EVENT_INVALID');
  return { payloadVersion: 1, profileId, deviceId, platform, deviceVersion, registrationResult };
}

export function buildDeviceRevokedPayload(
  profileId: string,
  deviceId: string,
  deviceVersion: number,
  revokedAt: Date,
  sessionRevokeState: 'pending' | 'not_linked',
): Record<string, unknown> {
  assertProfileIdentity(profileId, deviceVersion);
  if (!uuid.test(deviceId) || !Number.isFinite(revokedAt.getTime())) {
    throw new Error('DEVICE_EVENT_INVALID');
  }
  return {
    payloadVersion: 1,
    profileId,
    deviceId,
    deviceVersion,
    revokedAt: revokedAt.toISOString(),
    sessionRevokeState,
  };
}
