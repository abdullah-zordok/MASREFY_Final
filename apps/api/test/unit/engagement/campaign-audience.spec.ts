import {
  audienceHash,
  parseAudience,
  transitionCampaign,
} from '../../../src/engagement/campaign.service';

describe('campaign governance', () => {
  it('normalizes a bounded server-known audience and creates a stable hash', () => {
    const audience = parseAudience({
      platforms: ['web', 'ios'],
      locales: ['en', 'ar'],
      activity: 'active',
      segmentKeys: ['salary_users'],
    });
    expect(audience).toEqual({
      platforms: ['ios', 'web'],
      locales: ['ar', 'en'],
      activity: 'active',
      segmentKeys: ['salary_users'],
    });
    expect(audienceHash(audience)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      audienceHash(
        parseAudience({
          segmentKeys: ['salary_users'],
          activity: 'active',
          locales: ['ar', 'en'],
          platforms: ['ios', 'web'],
        }),
      ),
    ).toBe(audienceHash(audience));
  });

  it.each([
    { sql: 'select * from profiles' },
    { platforms: ['ios'], url: 'https://example.test' },
    {
      platforms: ['ios'],
      segmentKeys: Array.from({ length: 11 }, (_, index) => `s${String(index)}`),
    },
    { platforms: ['unknown'] },
  ])('rejects arbitrary or unbounded audience input', (input) => {
    expect(() => parseAudience(input)).toThrow('CAMPAIGN_AUDIENCE_INVALID');
  });

  it('enforces one-time lifecycle and creator/approver separation above threshold', () => {
    expect(() =>
      transitionCampaign(
        { status: 'draft', creatorId: 'a', audienceCount: 10_001 },
        'approve',
        'a',
        10_000,
      ),
    ).toThrow('CAMPAIGN_APPROVER_SEPARATION_REQUIRED');
    expect(
      transitionCampaign(
        { status: 'draft', creatorId: 'a', audienceCount: 10_001 },
        'approve',
        'b',
        10_000,
      ).status,
    ).toBe('approved');
    expect(() =>
      transitionCampaign(
        { status: 'approved', creatorId: 'a', audienceCount: 1 },
        'schedule',
        'b',
        10_000,
        new Date('2026-09-05T00:00:00Z'),
        new Date('2026-09-04T00:00:00Z'),
      ),
    ).toThrow('CAMPAIGN_SCHEDULE_INVALID');
  });
});
