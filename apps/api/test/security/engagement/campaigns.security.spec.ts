import { parseAudience, transitionCampaign } from '../../../src/engagement/campaign.service';

test('campaign controls reject expression injection, unbounded segments, and large self-approval', () => {
  expect(() => parseAudience({ sql: 'select * from profiles' })).toThrow(
    'CAMPAIGN_AUDIENCE_INVALID',
  );
  expect(() =>
    parseAudience({
      segmentKeys: Array.from({ length: 11 }, (_, index) => `segment-${String(index)}`),
    }),
  ).toThrow('CAMPAIGN_AUDIENCE_INVALID');
  expect(() =>
    transitionCampaign(
      { status: 'draft', creatorId: 'admin-1', audienceCount: 10_001 },
      'approve',
      'admin-1',
      10_000,
    ),
  ).toThrow('CAMPAIGN_APPROVER_SEPARATION_REQUIRED');
});
