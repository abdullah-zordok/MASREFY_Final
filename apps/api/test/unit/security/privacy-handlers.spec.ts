import {
  PrivacyHandlerRegistry,
  SUPPORT_ACTIONS,
  SUPPORT_RESOURCES,
  normalizeSupportScope,
  type PrivacyDomainHandler,
} from '../../../src/security/privacy-handlers';

const handler = (resourceType: string): PrivacyDomainHandler => ({
  resourceType,
  schemaVersion: 1,
  async *export() {
    /* no entries */
  },
  deleteAccount: () =>
    Promise.resolve({ deletedCount: 0, anonymizedCount: 0, retainedCount: 0, policyIds: [] }),
  listRetentionCandidates: () => Promise.resolve({ items: [], nextCursor: null }),
  applyRetention: () =>
    Promise.resolve({ deletedCount: 0, anonymizedCount: 0, retainedCount: 0, policyIds: [] }),
});

describe('privacy handler and support scope contracts', () => {
  it('keeps the support resource/action vocabulary closed', () => {
    expect(SUPPORT_RESOURCES).toEqual([
      'profile-contact',
      'account-status',
      'device-diagnostics',
      'session-diagnostics',
      'subscription-summary',
      'import-summary',
    ]);
    expect(SUPPORT_ACTIONS).toEqual(['read-masked', 'read-status', 'read-aggregate']);
    expect(() =>
      normalizeSupportScope([{ resource: 'profile-contact', actions: ['write'] }]),
    ).toThrow('SUPPORT_SCOPE_INVALID');
  });

  it('deduplicates and sorts valid support scope', () => {
    expect(
      normalizeSupportScope([
        { resource: 'session-diagnostics', actions: ['read-status'] },
        { resource: 'profile-contact', actions: ['read-masked', 'read-masked'] },
      ]),
    ).toEqual([
      { resource: 'profile-contact', actions: ['read-masked'] },
      { resource: 'session-diagnostics', actions: ['read-status'] },
    ]);
  });

  it('rejects duplicate handlers and missing manifest entries', () => {
    expect(
      () => new PrivacyHandlerRegistry([handler('identity'), handler('identity')], ['identity@1']),
    ).toThrow('PRIVACY_HANDLER_DUPLICATE');
    expect(
      () => new PrivacyHandlerRegistry([handler('identity')], ['identity@1', 'accounts@1']),
    ).toThrow('PRIVACY_HANDLER_MANIFEST_MISMATCH');
  });

  it('returns handlers in deterministic resource order', () => {
    const registry = new PrivacyHandlerRegistry(
      [handler('settings'), handler('identity')],
      ['identity@1', 'settings@1'],
    );
    expect(registry.entries().map((entry) => entry.resourceType)).toEqual(['identity', 'settings']);
  });
});
