import { createHash } from 'node:crypto';

export interface AudienceDefinition {
  platforms?: readonly ('ios' | 'android' | 'web')[];
  locales?: readonly ('ar' | 'en')[];
  activity?: 'all' | 'active' | 'inactive';
  segmentKeys?: readonly string[];
}

const keys = new Set(['platforms', 'locales', 'activity', 'segmentKeys']);
export const CAMPAIGN_SEGMENTS = new Set(['salary_users']);

export function parseAudience(input: unknown): AudienceDefinition {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.has(key))
  )
    throw new Error('CAMPAIGN_AUDIENCE_INVALID');
  const value = input as Record<string, unknown>;
  const list = (
    name: string,
    allowed: readonly string[],
    maximum: number,
  ): string[] | undefined => {
    const candidate = value[name];
    if (candidate === undefined) return undefined;
    if (
      !Array.isArray(candidate) ||
      candidate.length < 1 ||
      candidate.length > maximum ||
      new Set(candidate).size !== candidate.length ||
      candidate.some((item) => typeof item !== 'string' || !allowed.includes(item))
    )
      throw new Error('CAMPAIGN_AUDIENCE_INVALID');
    return (candidate as unknown[]).map(String).sort();
  };
  const platforms = list(
    'platforms',
    ['ios', 'android', 'web'],
    3,
  ) as AudienceDefinition['platforms'];
  const locales = list('locales', ['ar', 'en'], 2) as AudienceDefinition['locales'];
  const segments = value.segmentKeys;
  if (
    segments !== undefined &&
    (!Array.isArray(segments) ||
      segments.length > 10 ||
      new Set(segments).size !== segments.length ||
      segments.some((item) => typeof item !== 'string' || !CAMPAIGN_SEGMENTS.has(item)))
  )
    throw new Error('CAMPAIGN_AUDIENCE_INVALID');
  if (
    value.activity !== undefined &&
    (typeof value.activity !== 'string' || !['all', 'active', 'inactive'].includes(value.activity))
  )
    throw new Error('CAMPAIGN_AUDIENCE_INVALID');
  return {
    ...(platforms ? { platforms } : {}),
    ...(locales ? { locales } : {}),
    ...(value.activity ? { activity: value.activity as AudienceDefinition['activity'] } : {}),
    ...(segments ? { segmentKeys: (segments as unknown[]).map(String).sort() } : {}),
  };
}

export function audienceHash(value: AudienceDefinition): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

type CampaignStatus =
  'draft' | 'approved' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
type CampaignAction = 'approve' | 'schedule' | 'send_now' | 'pause' | 'resume' | 'cancel';

export function transitionCampaign(
  campaign: { status: CampaignStatus; creatorId: string; audienceCount: number },
  action: CampaignAction,
  actorId: string,
  approvalThreshold: number,
  now = new Date(),
  scheduledAt?: Date,
): { status: CampaignStatus; approvedBy?: string; scheduledAt?: Date } {
  if (action === 'approve') {
    if (campaign.status !== 'draft') throw new Error('CAMPAIGN_TRANSITION_INVALID');
    if (campaign.audienceCount > approvalThreshold && actorId === campaign.creatorId)
      throw new Error('CAMPAIGN_APPROVER_SEPARATION_REQUIRED');
    return { status: 'approved', approvedBy: actorId };
  }
  if (action === 'schedule') {
    if (campaign.status !== 'approved' || !scheduledAt || scheduledAt <= now)
      throw new Error('CAMPAIGN_SCHEDULE_INVALID');
    return { status: 'scheduled', scheduledAt };
  }
  if (action === 'send_now' && campaign.status === 'approved') return { status: 'running' };
  if (action === 'pause' && ['scheduled', 'running'].includes(campaign.status))
    return { status: 'paused' };
  if (action === 'resume' && campaign.status === 'paused') return { status: 'running' };
  if (
    action === 'cancel' &&
    ['approved', 'scheduled', 'running', 'paused'].includes(campaign.status)
  )
    return { status: 'cancelled' };
  throw new Error('CAMPAIGN_TRANSITION_INVALID');
}
