import { transitionCampaign } from '../../../src/engagement/campaign.service';

test('campaign lifecycle requires approval separation, future schedules, and valid transitions', () => {
  const campaign = { status: 'draft' as const, creatorId: 'creator', audienceCount: 20_000 };
  expect(() => transitionCampaign(campaign, 'approve', 'creator', 10_000)).toThrow(
    'CAMPAIGN_APPROVER_SEPARATION_REQUIRED',
  );
  expect(transitionCampaign(campaign, 'approve', 'approver', 10_000)).toMatchObject({
    status: 'approved',
    approvedBy: 'approver',
  });
  expect(() =>
    transitionCampaign(
      { ...campaign, status: 'approved' },
      'schedule',
      'approver',
      10_000,
      new Date('2026-09-05T08:00:00Z'),
      new Date('2026-09-05T07:59:00Z'),
    ),
  ).toThrow('CAMPAIGN_SCHEDULE_INVALID');
});
