import { buildEventEnvelope } from '../../../src/platform/outbox/event-envelope';
import {
  buildDeviceRegisteredPayload,
  buildDeviceRevokedPayload,
  buildProfileCreatedPayload,
  buildProfileUpdatedPayload,
} from '../../../src/identity/identity.events';

describe('identity event contracts', () => {
  it('builds the exact safe profile.created payload', () => {
    expect(buildProfileCreatedPayload('user_fixture_a', 'clerk_webhook', 'msg_fixture_a')).toEqual({
      payloadVersion: 1,
      profileId: 'user_fixture_a',
      profileVersion: 1,
      source: 'clerk_webhook',
      sourceEventId: 'msg_fixture_a',
    });
  });

  it('deduplicates and sorts the approved profile.updated fields', () => {
    expect(buildProfileUpdatedPayload(
      'user_fixture_a',
      4,
      ['timezone', 'locale', 'timezone'],
    )).toEqual({
      payloadVersion: 1,
      profileId: 'user_fixture_a',
      profileVersion: 4,
      changedFields: ['locale', 'timezone'],
      source: 'customer_api',
      sourceEventId: null,
    });
  });

  it.each([
    () => buildProfileCreatedPayload('user_fixture_a', 'clerk_webhook', null),
    () => buildProfileCreatedPayload(' user_fixture_a', 'clerk_reconciliation', null),
    () => buildProfileUpdatedPayload('user_fixture_a', 0, ['locale']),
    () => buildProfileUpdatedPayload('user_fixture_a', 2, ['status']),
    () => buildProfileUpdatedPayload('user_fixture_a', 2, []),
  ])('rejects invalid or server-controlled profile event input', (build) => {
    expect(build).toThrow();
  });

  it('keeps profile aggregate IDs null in the shared envelope', () => {
    const payload = buildProfileUpdatedPayload('user_fixture_a', 2, ['locale']);
    const envelope = buildEventEnvelope({
      id: '0198f79d-98f3-7bb4-a820-f43bb4d0e17e',
      createdAt: new Date('2026-08-28T12:00:00.000Z'),
      aggregateType: 'profile',
      aggregateId: null,
      eventType: 'profile.updated',
      payload,
      attemptCount: 0,
    }, 'request_fixture_01');
    expect(envelope.aggregate).toEqual({ type: 'profile', id: null });
    expect(JSON.stringify(envelope)).not.toMatch(/email|phone|session|token|secret/i);
  });

  it('builds bounded device payloads without session, fingerprint, or token evidence', () => {
    const deviceId = '4e971c69-210a-4c21-b535-5ad290d057df';
    const registered = buildDeviceRegisteredPayload(
      'user_fixture_a', deviceId, 'android', 2, 'refreshed',
    );
    const revoked = buildDeviceRevokedPayload(
      'user_fixture_a', deviceId, 3, new Date('2026-08-28T12:00:00.000Z'), 'pending',
    );
    expect(registered).toEqual({
      payloadVersion: 1,
      profileId: 'user_fixture_a',
      deviceId,
      platform: 'android',
      deviceVersion: 2,
      registrationResult: 'refreshed',
    });
    expect(revoked).toEqual({
      payloadVersion: 1,
      profileId: 'user_fixture_a',
      deviceId,
      deviceVersion: 3,
      revokedAt: '2026-08-28T12:00:00.000Z',
      sessionRevokeState: 'pending',
    });
    expect(JSON.stringify([registered, revoked])).not.toMatch(/sessionId|fingerprint|token|cipher|hash/i);
  });

  it.each([
    () => buildDeviceRegisteredPayload('user_fixture_a', 'invalid', 'android', 1, 'created'),
    () => buildDeviceRegisteredPayload(
      'user_fixture_a', '4e971c69-210a-4c21-b535-5ad290d057df', 'android', 0, 'created',
    ),
    () => buildDeviceRevokedPayload(
      'user_fixture_a', 'invalid', 1, new Date('2026-08-28T12:00:00.000Z'), 'pending',
    ),
  ])('rejects invalid device event identity/version input', (build) => {
    expect(build).toThrow();
  });
});
